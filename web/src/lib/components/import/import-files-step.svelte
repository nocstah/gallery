<script lang="ts">
  import { Icon } from '@immich/ui';
  import { mdiArrowLeft, mdiArrowRight, mdiClose, mdiFolderOpen, mdiTrayArrowDown, mdiZipBox } from '@mdi/js';
  import { t } from 'svelte-i18n';

  interface Props {
    files: File[];
    totalSize: number;
    onAddFiles: (files: File[]) => void;
    onClearFiles: () => void;
    onNext: () => void;
    onBack: () => void;
  }

  let { files, totalSize, onAddFiles, onClearFiles, onNext, onBack }: Props = $props();

  let zipInput: HTMLInputElement | undefined = $state();
  let folderInput: HTMLInputElement | undefined = $state();
  let isDragging = $state(false);

  function formatSize(bytes: number): string {
    if (bytes === 0) {
      return '0 B';
    }
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
  }

  function handleDrop(event: DragEvent) {
    event.preventDefault();
    isDragging = false;
    const droppedFiles = event.dataTransfer?.files;
    if (droppedFiles) {
      onAddFiles([...droppedFiles]);
    }
  }

  function handleDragOver(event: DragEvent) {
    event.preventDefault();
    isDragging = true;
  }

  function handleDragLeave() {
    isDragging = false;
  }

  function handleZipSelect(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files) {
      onAddFiles([...input.files]);
      input.value = '';
    }
  }

  function handleFolderSelect(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files) {
      onAddFiles([...input.files]);
      input.value = '';
    }
  }
</script>

<!-- Local Omarchy layer: the step on the gutter. The drop zone is a dashed hairline on the ground (ink while files are
     over it), its two pickers framed by a hairline; the files picked are rows split by hairlines, each name with its size
     in data type, the count beside the heading; Back is quiet and Next ink -->
<div class="ws-import-step">
  <h2 class="ws-import-heading">{$t('import_select_files')}</h2>

  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    data-testid="drop-zone"
    class="ws-import-drop"
    class:ws-import-drop-over={isDragging}
    ondragover={handleDragOver}
    ondragleave={handleDragLeave}
    ondrop={handleDrop}
  >
    <Icon icon={mdiTrayArrowDown} size="32" />
    <p class="ws-import-note">{$t('import_drop_files')}</p>
    <div class="ws-import-pickers">
      <button type="button" class="ws-import-outline" onclick={() => zipInput?.click()}>
        <Icon icon={mdiZipBox} size="16" />
        {$t('import_select_zips')}
      </button>
      <button type="button" class="ws-import-outline" onclick={() => folderInput?.click()}>
        <Icon icon={mdiFolderOpen} size="16" />
        {$t('import_select_folder')}
      </button>
    </div>
  </div>

  <!-- Hidden file inputs -->
  <input bind:this={zipInput} type="file" accept=".zip" multiple class="hidden" onchange={handleZipSelect} />
  <input bind:this={folderInput} type="file" webkitdirectory class="hidden" onchange={handleFolderSelect} />

  {#if files.length > 0}
    <section class="ws-import-files">
      <h3 class="ws-sharing-heading">
        {$t('import_selected_files')} <span class="ws-inbox-meta">{files.length}</span>
        <button type="button" class="ws-sharing-heading-action ws-import-clear" onclick={onClearFiles}>
          <Icon icon={mdiClose} size="16" />
          {$t('import_clear')}
        </button>
      </h3>
      <ul class="ws-import-file-list">
        {#each files as file (file.name)}
          <li>
            <span class="ws-import-file-name">{file.name}</span>
            <span class="ws-inbox-meta">{formatSize(file.size)}</span>
          </li>
        {/each}
      </ul>
      <p class="ws-import-total">{$t('total')} <span class="ws-inbox-meta">{formatSize(totalSize)}</span></p>
    </section>
  {/if}

  <div class="ws-import-nav">
    <button type="button" class="ws-btn-quiet" onclick={onBack}>
      <Icon icon={mdiArrowLeft} size="16" />
      {$t('back')}
    </button>
    <button type="button" class="ws-btn" data-testid="next-button" disabled={files.length === 0} onclick={onNext}>
      {$t('next')}
      <Icon icon={mdiArrowRight} size="16" />
    </button>
  </div>
</div>

<style>
  .ws-import-drop {
    display: grid;
    justify-items: center;
    gap: 1rem;
    width: 100%;
    padding: 2.5rem 1.5rem;
    border: 1px dashed color-mix(in oklab, var(--immich-ui-dark) 28%, transparent);
    border-radius: var(--ws-radius);
    color: var(--immich-ui-muted);
    text-align: center;
    transition:
      border-color 140ms,
      background-color 140ms;
  }
  .ws-import-drop-over {
    border-color: var(--immich-ui-dark);
    background: color-mix(in oklab, var(--immich-ui-dark) 5%, transparent);
  }
  .ws-import-pickers {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 0.5rem;
  }
  .ws-import-files {
    width: 100%;
  }
  .ws-import-clear {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
  }
  .ws-import-file-list {
    max-height: 18rem;
    overflow-y: auto;
    list-style: none;
  }
  .ws-import-file-list li {
    display: flex;
    justify-content: space-between;
    gap: 1rem;
    padding: 0.45rem 0;
    border-bottom: 1px solid var(--ws-hairline);
  }
  .ws-import-file-name {
    overflow: hidden;
    font-size: var(--ws-text-ui);
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .ws-import-file-list .ws-inbox-meta {
    flex: none;
  }
  .ws-import-total {
    display: flex;
    gap: 0.5rem;
    align-items: baseline;
    margin-top: 0.75rem;
    font-size: var(--ws-text-meta);
    color: var(--immich-ui-muted);
  }
  @media (prefers-reduced-motion: reduce) {
    .ws-import-drop {
      transition: none;
    }
  }
</style>
