<script lang="ts">
  import { ImportManager, ImportStep } from '$lib/managers/import-manager.svelte';
  import type { ImportOptions } from '$lib/managers/import-manager.svelte';
  import { scanTakeoutFiles } from '$lib/utils/google-takeout-scanner';
  import type { ScanResult } from '$lib/utils/google-takeout-scanner';
  import { createImportAlbums, uploadTakeoutItem } from '$lib/utils/google-takeout-uploader';
  import { t } from 'svelte-i18n';
  import { SvelteMap, SvelteSet } from 'svelte/reactivity';
  import { get } from 'svelte/store';
  import ImportFilesStep from './import-files-step.svelte';
  import ImportProgressStep from './import-progress-step.svelte';
  import ImportReviewStep from './import-review-step.svelte';
  import ImportScanStep from './import-scan-step.svelte';
  import ImportSourceStep from './import-source-step.svelte';
  import ImportStepIndicator from './import-step-indicator.svelte';

  const manager = new ImportManager();

  let abortController: AbortController | undefined = $state(undefined);

  async function startScan() {
    manager.currentStep = ImportStep.Scan;
    manager.scanProgress = undefined;

    abortController = new AbortController();

    try {
      const result: ScanResult = await scanTakeoutFiles({
        files: manager.selectedFiles,
        onProgress: (progress) => {
          manager.scanProgress = { ...progress, albumNames: new SvelteSet(progress.albumNames) };
        },
        signal: abortController.signal,
      });

      manager.scanResult = result;
      manager.setAlbums(result.albums);
      manager.currentStep = ImportStep.Review;
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        // User cancelled — stay on files step (previousStep already called in onCancel)
        return;
      }
      console.error('Scan failed:', error);
      manager.currentStep = ImportStep.Files;
    }
  }

  function cancelScan() {
    abortController?.abort();
    manager.previousStep();
  }

  async function startImport() {
    if (!manager.scanResult) {
      return;
    }

    manager.currentStep = ImportStep.Import;
    const items = manager.scanResult.items;
    const assetIdMap = new SvelteMap<string, string>();

    manager.importProgress = {
      imported: 0,
      skipped: 0,
      errors: 0,
      total: items.length,
      currentFile: '',
      currentAlbum: '',
      albumsCreated: 0,
      errorLog: [],
    };

    // Upload items one by one
    for (const item of items) {
      // Respect pause
      while (manager.isPaused) {
        await new Promise((resolve) => setTimeout(resolve, 200));
      }

      manager.importProgress = {
        ...manager.importProgress,
        currentFile: item.name,
      };

      const result = await uploadTakeoutItem(item, manager.options);

      if (result.status === 'imported') {
        manager.trackImported();
        assetIdMap.set(item.path, result.assetId);
      } else if (result.status === 'duplicate') {
        manager.trackSkipped();
        if (result.assetId) {
          assetIdMap.set(item.path, result.assetId);
        }
      } else {
        manager.trackError(item.name, result.error ?? get(t)('import_unknown_error'));
      }
    }

    // Create albums
    if (manager.selectedAlbums.size > 0) {
      const albumCount = await createImportAlbums(items, assetIdMap, manager.selectedAlbums);
      manager.importProgress = {
        ...manager.importProgress,
        albumsCreated: albumCount,
      };
    }

    manager.isComplete = true;
  }

  function handleSetOption(key: string, value: boolean) {
    manager.setOption(key as keyof ImportOptions, value);
  }
</script>

<!-- Local Omarchy layer: the wizard is a column on the page's gutter (upstream centred it in a box): the steps on top in
     data type with a hairline under them, then the step in hand -->
<div class="ws-import">
  <ImportStepIndicator currentStep={manager.currentStep} />

  {#if manager.currentStep === ImportStep.Source}
    <ImportSourceStep onNext={() => manager.nextStep()} />
  {:else if manager.currentStep === ImportStep.Files}
    <ImportFilesStep
      files={manager.selectedFiles}
      totalSize={manager.totalSize}
      onAddFiles={(files) => manager.addFiles(files)}
      onClearFiles={() => manager.clearFiles()}
      onNext={startScan}
      onBack={() => manager.previousStep()}
    />
  {:else if manager.currentStep === ImportStep.Scan}
    <ImportScanStep progress={manager.scanProgress} onCancel={cancelScan} />
  {:else if manager.currentStep === ImportStep.Review}
    {#if manager.scanResult}
      <ImportReviewStep
        items={manager.scanResult.items}
        albums={manager.scanResult.albums}
        selectedAlbums={manager.selectedAlbums}
        options={manager.options}
        stats={manager.scanResult.stats}
        onToggleAlbum={(name) => manager.toggleAlbum(name)}
        onSelectAllAlbums={() => manager.selectAllAlbums()}
        onDeselectAllAlbums={() => manager.deselectAllAlbums()}
        onSetOption={handleSetOption}
        onImport={startImport}
        onBack={() => manager.previousStep()}
      />
    {/if}
  {:else if manager.currentStep === ImportStep.Import}
    <ImportProgressStep
      progress={manager.importProgress}
      total={manager.scanResult?.items.length ?? 0}
      isPaused={manager.isPaused}
      isComplete={manager.isComplete}
      onTogglePause={() => manager.togglePause()}
    />
  {/if}
</div>

<style>
  .ws-import {
    display: grid;
    gap: 1.5rem;
    max-width: 48rem;
    padding: calc(var(--ws-gap) * 0.6) 0 4rem;
    color: var(--immich-ui-dark);
  }
  /* what every step shares: a column of its parts, a heading in the heading role, notes in muted body type, and its
     way on (Back quiet, the next step ink) in a row at the start */
  .ws-import :global(.ws-import-step) {
    display: grid;
    gap: 1.25rem;
    justify-items: start;
  }
  .ws-import :global(.ws-import-heading) {
    font-size: var(--ws-text-heading);
    font-weight: 650;
    line-height: 1.3;
  }
  .ws-import :global(.ws-import-note) {
    max-width: 60ch;
    font-size: var(--ws-text-body);
    line-height: 1.55;
    color: var(--immich-ui-muted);
  }
  .ws-import :global(.ws-import-nav) {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin-top: 0.5rem;
  }
  .ws-import :global(.ws-import-nav > .ws-btn-quiet:first-child) {
    margin-inline-start: -0.6rem;
  }
  .ws-import :global(:is(.ws-btn, .ws-btn-quiet, .ws-import-outline)) {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
  }
  /* a second action beside the step's ink one: the ground with a hairline frame */
  .ws-import :global(.ws-import-outline) {
    padding: 0.5rem 0.95rem;
    border: 1px solid var(--ws-hairline);
    border-radius: var(--ws-radius);
    color: var(--immich-ui-dark);
    font-size: var(--ws-text-ui);
    font-weight: 600;
    white-space: nowrap;
  }
  .ws-import :global(.ws-import-outline:hover) {
    background: color-mix(in oklab, var(--immich-ui-dark) 7%, transparent);
  }
  .ws-import :global(.ws-import-outline:focus-visible) {
    outline: var(--ws-border) solid var(--ws-accent);
    outline-offset: 3px;
  }
  /* counts as a line of label and number, the number in data type */
  .ws-import :global(.ws-import-stats) {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem 1.5rem;
    font-size: var(--ws-text-meta);
    color: var(--immich-ui-muted);
  }
  .ws-import :global(.ws-import-stats > *) {
    display: inline-flex;
    gap: 0.4rem;
    align-items: baseline;
  }
  .ws-import :global(.ws-import-count) {
    color: var(--immich-ui-dark);
    font-family: var(--ws-font-data);
    font-size: var(--ws-text-data);
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }
</style>
