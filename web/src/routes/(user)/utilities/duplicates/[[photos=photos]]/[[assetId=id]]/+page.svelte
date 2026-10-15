<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { shortcuts } from '$lib/actions/shortcut';
  import UserPageLayout from '$lib/components/layouts/UserPageLayout.svelte';
  import LinkToDocs from './LinkToDocs.svelte';
  import DuplicatesCompareControl from './DuplicatesCompareControl.svelte';
  import { assetViewerManager } from '$lib/managers/asset-viewer-manager.svelte';
  import { featureFlagsManager } from '$lib/managers/feature-flags-manager.svelte';
  import { languageManager } from '$lib/managers/language-manager.svelte';
  import ShortcutsModal from '$lib/modals/ShortcutsModal.svelte';
  import { Route } from '$lib/route';
  import { locale } from '$lib/stores/preferences.store';
  import { handleError } from '$lib/utils/handle-error';
  import type { AssetResponseDto } from '@immich/sdk';
  import { createStack, deleteDuplicates, resolveDuplicates, updateAssets } from '@immich/sdk';
  import { Button, HStack, Icon, IconButton, modalManager, Text, toastManager } from '@immich/ui';
  import {
    mdiCheckOutline,
    mdiChevronLeft,
    mdiChevronRight,
    mdiKeyboard,
    mdiPageFirst,
    mdiPageLast,
    mdiTrashCanOutline,
  } from '@mdi/js';
  import { t } from 'svelte-i18n';
  import type { PageData } from './$types';

  interface Props {
    data: PageData;
  }

  let { data = $bindable() }: Props = $props();

  interface Shortcuts {
    general: ExplainedShortcut[];
    actions: ExplainedShortcut[];
  }
  interface ExplainedShortcut {
    key: string[];
    action: string;
    info?: string;
  }

  const duplicateShortcuts: Shortcuts = {
    general: [],
    actions: [
      { key: ['a'], action: $t('select_all_duplicates') },
      { key: ['s'], action: $t('view') },
      { key: ['d'], action: $t('unselect_all_duplicates') },
      { key: ['⇧', 'c'], action: $t('resolve_duplicates') },
      { key: ['⇧', 's'], action: $t('stack_duplicates') },
    ],
  };

  let duplicates = $state(data.duplicates);
  let qrSlips = $state(data.qrSlips);
  const showQrSlips = () => {
    duplicates = [...duplicates, ...qrSlips];
    qrSlips = [];
  };
  let showMore = $state(false);

  const correctDuplicatesIndex = (index: number) => {
    return Math.max(0, Math.min(index, duplicates.length - 1));
  };

  let duplicatesIndex = $derived(
    (() => {
      const indexParam = page.url.searchParams.get('index') ?? '0';
      const parsedIndex = Math.trunc(Number(indexParam));
      return correctDuplicatesIndex(Number.isNaN(parsedIndex) ? 0 : parsedIndex);
    })(),
  );

  let hasDuplicates = $derived(duplicates.length > 0);
  const withConfirmation = async (callback: () => Promise<void>, prompt?: string, confirmText?: string) => {
    if (prompt && confirmText) {
      const isConfirmed = await modalManager.showDialog({ prompt, confirmText });
      if (!isConfirmed) {
        return;
      }
    }

    try {
      return await callback();
    } catch (error) {
      handleError(error, $t('errors.unable_to_resolve_duplicate'));
    }
  };

  const deletedNotification = (trashedCount: number) => {
    if (!trashedCount) {
      return;
    }

    const message = featureFlagsManager.value.trash
      ? $t('assets_moved_to_trash_count', { values: { count: trashedCount } })
      : $t('permanently_deleted_assets_count', { values: { count: trashedCount } });
    toastManager.primary(message);
  };

  const handleResolve = async (duplicateId: string, duplicateAssetIds: string[], trashIds: string[]) => {
    const forceDelete = !featureFlagsManager.value.trash;
    const shouldConfirmDelete = trashIds.length > 0 && forceDelete;

    return withConfirmation(
      async () => {
        const keepAssetIds = duplicateAssetIds.filter((id) => !trashIds.includes(id));

        const response = await resolveDuplicates({
          duplicateResolveDto: {
            groups: [{ duplicateId, keepAssetIds, trashAssetIds: trashIds }],
          },
        });

        const { success, error, errorMessage } = response[0];
        if (!success) {
          throw new Error(errorMessage || error);
        }

        duplicates = duplicates.filter((duplicate) => duplicate.duplicateId !== duplicateId);

        deletedNotification(trashIds.length);
        await navigateToIndex(duplicatesIndex);
      },
      shouldConfirmDelete ? $t('delete_duplicates_confirmation') : undefined,
      shouldConfirmDelete ? $t('permanently_delete') : undefined,
    );
  };

  const handleStack = async (duplicateId: string, assets: AssetResponseDto[]) => {
    const assetIds = assets.map((asset) => asset.id);
    await createStack({ stackCreateDto: { assetIds } });
    await updateAssets({ assetBulkUpdateDto: { ids: assetIds, duplicateId: null } });
    duplicates = duplicates.filter((duplicate) => duplicate.duplicateId !== duplicateId);
    await navigateToIndex(duplicatesIndex);
  };

  const handleDeduplicateAll = async () => {
    // Use server-provided suggestedKeepAssetIds from each group
    const idsToDelete = duplicates.flatMap((group) => {
      const keepIds = new Set(group.suggestedKeepAssetIds);
      return group.assets.map((asset) => asset.id).filter((id) => !keepIds.has(id));
    });

    let prompt, confirmText;
    if (featureFlagsManager.value.trash) {
      prompt = $t('bulk_trash_duplicates_confirmation', { values: { count: idsToDelete.length } });
      confirmText = $t('confirm');
    } else {
      prompt = $t('bulk_delete_duplicates_confirmation', { values: { count: idsToDelete.length } });
      confirmText = $t('permanently_delete');
    }

    return withConfirmation(
      async () => {
        // Resolve all groups in a single batch request
        const response = await resolveDuplicates({
          duplicateResolveDto: {
            groups: duplicates.map((group) => {
              const keepIds = new Set(group.suggestedKeepAssetIds);
              return {
                duplicateId: group.duplicateId,
                keepAssetIds: group.suggestedKeepAssetIds,
                trashAssetIds: group.assets.map((asset) => asset.id).filter((id) => !keepIds.has(id)),
              };
            }),
          },
        });

        // Count failures and show appropriate message
        const failedCount = response.filter(({ success }) => !success).length;
        if (failedCount > 0) {
          toastManager.danger($t('errors.unable_to_resolve_duplicate'));
        }

        duplicates = [];

        deletedNotification(idsToDelete.length);

        page.url.searchParams.delete('index');
        await goto(Route.duplicatesUtility());
      },
      prompt,
      confirmText,
    );
  };

  const handleKeepAll = async () => {
    const ids = duplicates.map(({ duplicateId }) => duplicateId);
    return withConfirmation(
      async () => {
        await deleteDuplicates({ bulkIdsDto: { ids } });

        duplicates = [];

        toastManager.primary($t('resolved_all_duplicates'));
        page.url.searchParams.delete('index');
        await goto(Route.duplicatesUtility());
      },
      $t('bulk_keep_duplicates_confirmation', { values: { count: ids.length } }),
      $t('confirm'),
    );
  };

  const handleFirst = () => navigateToIndex(0);
  const handlePrevious = () => navigateToIndex(Math.max(duplicatesIndex - 1, 0));
  const handleNext = async () => navigateToIndex(Math.min(duplicatesIndex + 1, duplicates.length - 1));
  const handleLast = () => navigateToIndex(duplicates.length - 1);

  const navigateToIndex = async (index: number) =>
    goto(Route.duplicatesUtility({ index: correctDuplicatesIndex(index) }));
</script>

<svelte:document
  use:shortcuts={assetViewerManager.isViewing
    ? []
    : [
        { shortcut: { key: 'ArrowLeft' }, onShortcut: handlePrevious },
        { shortcut: { key: 'ArrowRight' }, onShortcut: handleNext },
      ]}
/>

<!-- Local Omarchy layer: the count of groups follows the title in data type, as on every page of the one bar -->
<UserPageLayout
  title={data.meta.title}
  description={hasDuplicates ? duplicates.length.toLocaleString($locale) : undefined}
  scrollbar={true}
>
  {#snippet buttons()}
    <HStack gap={0}>
      <Button
        leadingIcon={mdiTrashCanOutline}
        onclick={() => handleDeduplicateAll()}
        disabled={!hasDuplicates}
        size="small"
        variant="ghost"
        color="secondary"
      >
        <Text class="hidden md:block">{$t('deduplicate_all')}</Text>
      </Button>
      <Button
        leadingIcon={mdiCheckOutline}
        onclick={() => handleKeepAll()}
        disabled={!hasDuplicates}
        size="small"
        variant="ghost"
        color="secondary"
      >
        <Text class="hidden md:block">{$t('keep_all')}</Text>
      </Button>
      <IconButton
        shape="round"
        variant="ghost"
        color="secondary"
        icon={mdiKeyboard}
        title={$t('show_keyboard_shortcuts')}
        onclick={() => modalManager.show(ShortcutsModal, { shortcuts: duplicateShortcuts })}
        aria-label={$t('show_keyboard_shortcuts')}
      />
    </HStack>
  {/snippet}

  <!-- Local Omarchy layer: the page on its gutter: how it works in a muted line or two, then the group (its tools, its
       photos and their details) and under a hairline the way through the groups, the place in data type. With no
       groups, an empty state: why, and what to do next (the payment slips left out, when there are some) -->
  {#if hasDuplicates}
    <div class="ws-dup-page">
      <p class="ws-dup-note">
        {$t('duplicates_description')}
        <LinkToDocs href="https://docs.immich.app/features/duplicates-utility" />
      </p>
      {#if qrSlips.length > 0}
        <p class="ws-dup-note">
          {$t('duplicates_qr_skipped', { values: { count: qrSlips.length } })}
          <button type="button" class="ws-empty-link" onclick={showQrSlips}>{$t('duplicates_qr_show')}</button>
        </p>
      {/if}

      {#key duplicates[duplicatesIndex].duplicateId}
        <div class="ws-dup-group">
          <DuplicatesCompareControl
            assets={duplicates[duplicatesIndex].assets}
            suggestedKeepAssetIds={duplicates[duplicatesIndex].suggestedKeepAssetIds}
            bind:showMore
            onResolve={(duplicateAssetIds, trashIds) =>
              handleResolve(duplicates[duplicatesIndex].duplicateId, duplicateAssetIds, trashIds)}
            onStack={(assets) => handleStack(duplicates[duplicatesIndex].duplicateId, assets)}
          />
          <nav class="ws-dup-pager" aria-label={data.meta.title}>
            <button
              type="button"
              class="ws-btn-quiet"
              onclick={handleFirst}
              disabled={duplicatesIndex === 0}
              title={$t('first')}
            >
              <Icon icon={languageManager.rtl ? mdiPageLast : mdiPageFirst} size="16" />
              <span class="ws-dup-pager-label">{$t('first')}</span>
            </button>
            <button
              type="button"
              class="ws-btn-quiet"
              onclick={handlePrevious}
              disabled={duplicatesIndex === 0}
              title={$t('previous')}
            >
              <Icon icon={languageManager.rtl ? mdiChevronRight : mdiChevronLeft} size="16" />
              <span class="ws-dup-pager-label">{$t('previous')}</span>
            </button>
            <span class="ws-dup-position">
              {(duplicatesIndex + 1).toLocaleString($locale)} / {duplicates.length.toLocaleString($locale)}
            </span>
            <button
              type="button"
              class="ws-btn-quiet"
              onclick={handleNext}
              disabled={duplicatesIndex === duplicates.length - 1}
              title={$t('next')}
            >
              <span class="ws-dup-pager-label">{$t('next')}</span>
              <Icon icon={languageManager.rtl ? mdiChevronLeft : mdiChevronRight} size="16" />
            </button>
            <button
              type="button"
              class="ws-btn-quiet"
              onclick={handleLast}
              disabled={duplicatesIndex === duplicates.length - 1}
              title={$t('last')}
            >
              <span class="ws-dup-pager-label">{$t('last')}</span>
              <Icon icon={languageManager.rtl ? mdiPageFirst : mdiPageLast} size="16" />
            </button>
          </nav>
        </div>
      {/key}
    </div>
  {:else}
    <div class="ws-page-column">
      <div class="ws-empty">
        <h2 class="ws-empty-title">{$t('no_duplicates_found')}</h2>
        {#if qrSlips.length > 0}
          <p class="ws-empty-body">{$t('duplicates_qr_skipped', { values: { count: qrSlips.length } })}</p>
          <div class="ws-empty-actions">
            <button type="button" class="ws-empty-action" onclick={showQrSlips}>{$t('duplicates_qr_show')}</button>
          </div>
        {:else}
          <p class="ws-empty-body">{$t('duplicates_empty_body')}</p>
          <div class="ws-empty-actions">
            <a class="ws-empty-action" href={Route.utilities()}>{$t('utilities')}</a>
          </div>
        {/if}
      </div>
    </div>
  {/if}
</UserPageLayout>

<style>
  .ws-dup-page {
    padding: calc(var(--ws-gap) * 0.6) 0 4rem;
    color: var(--immich-ui-dark);
  }
  /* how the page works, one muted line each, as an album's note */
  .ws-dup-note {
    max-width: 60ch;
    font-size: var(--ws-text-ui);
    line-height: 1.5;
    color: var(--immich-ui-muted);
  }
  .ws-dup-note + .ws-dup-note {
    margin-top: 0.35rem;
  }
  .ws-dup-note button {
    margin-inline-start: 0.35rem;
  }
  .ws-dup-group {
    width: fit-content;
    max-width: 100%;
    margin-top: 1.5rem;
  }
  /* the way through the groups under a hairline, the place in data type between the arrows */
  .ws-dup-pager {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 2px;
    margin-top: 1rem;
    padding-top: calc(var(--ws-gap) * 0.8);
    border-top: 1px solid var(--ws-hairline);
  }
  .ws-dup-pager button {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
  }
  .ws-dup-pager > button:first-child {
    margin-inline-start: -0.6rem;
  }
  .ws-dup-position {
    padding-inline: 0.75rem;
    font-family: var(--ws-font-data);
    font-size: var(--ws-text-data);
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    color: var(--immich-ui-dark);
    white-space: nowrap;
  }
  /* a phone keeps the arrows and the place; the words stay in the buttons' titles */
  @media (max-width: 639px) {
    .ws-dup-pager-label {
      display: none;
    }
  }
</style>
