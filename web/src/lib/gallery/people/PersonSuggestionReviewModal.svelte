<script lang="ts">
  import { beforeNavigate } from '$app/navigation';
  import { page } from '$app/state';
  import { shouldIgnoreEvent } from '$lib/actions/shortcut';
  import FaceCrop from '$lib/components/faces-page/face-crop.svelte';
  import ShortcutKeycap from '$lib/gallery/components/shortcut-keycap.svelte';
  import { faceSuggestionContextExpanded } from '$lib/gallery/people/face-suggestion-context.store';
  import SuggestionAssetDetails from '$lib/gallery/people/suggestion-asset-details.svelte';
  import SuggestionAssetSummary from '$lib/gallery/people/suggestion-asset-summary.svelte';
  import { getSuggestionAssetHref } from '$lib/gallery/people/suggestion-asset-href';
  import { getAssetMediaUrl } from '$lib/utils';
  import { getContentMetrics } from '$lib/utils/container-utils';
  import { handleError } from '$lib/utils/handle-error';
  import { getBoundingBox } from '$lib/utils/people-utils';
  import type { Faces } from '$lib/managers/asset-viewer-manager.svelte';
  import {
    AssetMediaSize,
    type PersonFaceSuggestionPageResponseDto,
    type PersonFaceSuggestionResponseDto,
    type PersonResponseDto,
  } from '@immich/sdk';
  import { Button, IconButton, Modal, ModalBody, ModalFooter, toastManager } from '@immich/ui';
  import {
    mdiAccountCheckOutline,
    mdiAccountRemoveOutline,
    mdiChevronLeft,
    mdiChevronRight,
    mdiEyeOffOutline,
  } from '@mdi/js';
  import { onMount } from 'svelte';
  import { SvelteMap, SvelteSet } from 'svelte/reactivity';
  import { t } from 'svelte-i18n';

  type PageReq = { page: number; size: number };

  // F24: the server states explicitly whether an action endpoint acted or was a no-op — see
  // person.controller.ts / shared-space.controller.ts. The modal reads THIS instead of inferring intent from
  // an error status code (the old `{ status: 400 }` check this replaced conflated the one genuinely benign
  // no-op case with a real authorization failure, which also 400s via requireAccess).
  //
  // S11b: the signal is the response BODY, not the status code. @oazapfts/runtime's ok() resolves to the
  // body and throws away the numeric status for every success code, so the generated SDK cannot surface a
  // 200-vs-204 distinction at all — every action endpoint answers 200 with `{ acted }`.
  type FaceSuggestionActionResult = { acted: boolean };

  interface Props {
    person: PersonResponseDto;
    referenceThumbnailUrl: string;
    loadPage: (req: PageReq) => Promise<PersonFaceSuggestionPageResponseDto>;
    confirm: (assetFaceId: string) => Promise<FaceSuggestionActionResult>;
    dismiss: (assetFaceId: string) => Promise<FaceSuggestionActionResult>;
    ignore: (assetFaceId: string) => Promise<FaceSuggestionActionResult>;
    onClose: (result: { confirmed: number }) => void;
  }

  let { person, referenceThumbnailUrl, loadPage, confirm, dismiss, ignore, onClose }: Props = $props();

  const PAGE_SIZE = 50;
  const PREFETCH = 3;

  type Choice = 'confirm' | 'dismiss' | 'ignore';
  const choiceLabels = {
    confirm: 'face_suggestion_same',
    dismiss: 'face_suggestion_different',
    ignore: 'face_suggestion_ignore',
  } as const;

  // Native confirmation drains the suggestion and cannot be replayed to undo an assignment.
  // Keep choices editable until closing; submit only the final choice for each face.
  const choices = new SvelteMap<string, Choice>();
  // A partial save must never replay requests that have already succeeded.
  const savedFaceIds = new SvelteSet<string>();

  let items = $state<PersonFaceSuggestionResponseDto[]>([]);
  let total = $state(0);
  let nextPage = 1;
  let hasMore = $state(true);
  let index = $state(0);
  let loading = $state(true);
  let busy = $state(false);
  let saving = $state(false);
  let saveFailed = $state(false);
  let saveCurrent = $state(0);
  let saveTotal = $state(0);
  let confirmed = $state(0);
  let imgEl = $state<HTMLImageElement | undefined>(undefined);
  let imgReady = $state(false);
  let photoWidth = $state(0);
  let photoHeight = $state(0);

  const current = $derived(items[index]);
  const currentChoice = $derived(current ? choices.get(current.assetFaceId) : undefined);
  const currentSaved = $derived(current ? savedFaceIds.has(current.assetFaceId) : false);
  const pendingCount = $derived(choices.size - savedFaceIds.size);
  const photoUrl = $derived(current ? getAssetMediaUrl({ id: current.assetId, size: AssetMediaSize.Preview }) : '');
  const allDone = $derived(!loading && !current);
  const displayTotal = $derived(Math.max(total, items.length));

  const highlight = $derived.by(() => {
    // The contained image and its overlay must track a resized photo frame.
    void photoWidth;
    void photoHeight;
    if (!current || !imgReady || !imgEl) {
      return undefined;
    }
    return getBoundingBox(
      [
        {
          id: current.assetFaceId,
          imageWidth: current.imageWidth,
          imageHeight: current.imageHeight,
          boundingBoxX1: current.boundingBoxX1,
          boundingBoxX2: current.boundingBoxX2,
          boundingBoxY1: current.boundingBoxY1,
          boundingBoxY2: current.boundingBoxY2,
        } satisfies Faces,
      ],
      getContentMetrics(imgEl),
    )[0];
  });

  // Drafts leave the queue intact, so normal pagination is safe. After a partial save, restart
  // at page 1 and skip buffered faces: saved rows have then shifted the server's offsets.
  async function fetchNext() {
    while (hasMore) {
      const res = await loadPage({ page: nextPage, size: PAGE_SIZE });
      total = res.total + savedFaceIds.size;
      hasMore = res.items.length > 0 && nextPage * PAGE_SIZE < res.total;
      nextPage++;
      const existingIds = new Set(items.map((it) => it.assetFaceId));
      const newOnes = res.items.filter((it) => !existingIds.has(it.assetFaceId));
      if (newOnes.length > 0) {
        items = [...items, ...newOnes];
        return;
      }
    }
  }

  onMount(async () => {
    try {
      await fetchNext();
    } catch (error) {
      handleError(error, $t('errors.unable_to_load_face_suggestions'));
      onClose({ confirmed });
      return;
    } finally {
      loading = false;
    }
    if (items.length === 0) {
      onClose({ confirmed });
    }
  });

  async function advance() {
    index++;
    if (hasMore && index >= items.length - PREFETCH) {
      try {
        await fetchNext();
      } catch (error) {
        if (index >= items.length) {
          index--;
        }
        handleError(error, $t('errors.unable_to_load_face_suggestions'));
      }
    }
    // Stay open at the end so Previous can still correct the very last face.
  }

  async function act(kind: Choice) {
    if (loading || busy || !current || currentSaved) {
      return;
    }
    busy = true;
    choices.set(current.assetFaceId, kind);
    try {
      await advance();
    } finally {
      busy = false;
    }
  }

  const canPrev = $derived(index > 0);
  const canNext = $derived(!!current && (index < items.length - 1 || hasMore || !!currentChoice));

  async function step(delta: number) {
    if (loading || busy) {
      return;
    }
    if (delta < 0 && canPrev) {
      index--;
    } else if (delta > 0 && canNext) {
      busy = true;
      try {
        await advance();
      } finally {
        busy = false;
      }
    }
  }

  async function saveAndClose() {
    if (loading || busy) {
      return;
    }
    busy = true;
    saving = true;
    saveFailed = false;
    const pending = [...choices].filter(([face]) => !savedFaceIds.has(face));
    saveTotal = pending.length;
    let savingFace: string | undefined;
    try {
      for (const [offset, [face, kind]] of pending.entries()) {
        saveCurrent = offset + 1;
        savingFace = face;
        const result =
          kind === 'confirm' ? await confirm(face) : kind === 'dismiss' ? await dismiss(face) : await ignore(face);
        savedFaceIds.add(face);
        if (kind === 'confirm' && result.acted) {
          confirmed++;
        }
      }
      if (confirmed > 0) {
        toastManager.primary($t('face_suggestion_confirmed_toast', { values: { count: confirmed } }));
      }
      onClose({ confirmed });
    } catch (error) {
      // Every failure stays visible and retryable; a 400 is NOT an already-resolved signal.
      saveFailed = true;
      if (savingFace) {
        index = items.findIndex((it) => it.assetFaceId === savingFace);
      }
      nextPage = 1;
      hasMore = true;
      handleError(error, $t('errors.unable_to_process_face_suggestion'));
    } finally {
      saving = false;
      busy = false;
    }
  }

  // Closing the dialog saves. Browser navigation/reload must not silently discard an unfinished session.
  beforeNavigate((navigation) => {
    if (pendingCount > 0 || saving) {
      navigation.cancel();
    }
  });

  $effect(() => {
    void current?.assetFaceId;
    imgReady = false;
  });

  function onKeydown(event: KeyboardEvent) {
    if (
      event.defaultPrevented ||
      event.isComposing ||
      event.ctrlKey ||
      event.metaKey ||
      event.altKey ||
      event.shiftKey ||
      shouldIgnoreEvent(event)
    ) {
      return;
    }
    if (event.key === 'Enter') {
      if (event.target instanceof Element && event.target.closest('[data-testid="suggestion-save-btn"]')) {
        return;
      }
      // Cancel native activation of whichever button has focus: Enter always means Same person.
      event.preventDefault();
      if (!loading && !event.repeat) {
        void act('confirm');
      }
      return;
    }
    if (loading) {
      return;
    }
    switch (event.key) {
      case 'm': {
        event.preventDefault();
        if (!event.repeat) {
          faceSuggestionContextExpanded.update((open) => !open);
        }
        break;
      }
      case 'o': {
        event.preventDefault();
        if (current && !event.repeat) {
          window.open(getSuggestionAssetHref(current.assetId, page.params.spaceId), '_blank', 'noopener');
        }
        break;
      }
      case 'ArrowRight':
      case ']': {
        event.preventDefault();
        void step(1);
        break;
      }
      case 'ArrowLeft':
      case '[': {
        event.preventDefault();
        void step(-1);
        break;
      }
    }
  }
</script>

<svelte:window onkeydown={onKeydown} />

<Modal
  title={person.name
    ? $t('face_suggestion_modal_title', { values: { name: person.name } })
    : $t('face_suggestion_modal_title_unnamed')}
  size="large"
  class="person-suggestion-review"
  onClose={() => void saveAndClose()}
  onEscapeKeydown={(event) => {
    event.preventDefault();
    void saveAndClose();
  }}
>
  <ModalBody class="person-suggestion-review-body">
    <div class="suggestion-review-content">
      {#if saveFailed}
        <div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p role="alert" class="text-sm">{$t('face_suggestion_save_error')}</p>
          <Button
            variant="ghost"
            class="shrink-0"
            disabled={busy}
            data-testid="suggestion-discard-btn"
            onclick={() => onClose({ confirmed })}
          >
            {$t('face_suggestion_discard_unsaved')}
          </Button>
        </div>
      {/if}
      {#if loading}
        <div
          data-testid="suggestion-loading"
          class="min-h-0 flex-1 animate-pulse rounded-lg bg-gray-200 dark:bg-gray-800"
        ></div>
      {:else if current}
        <div class="suggestion-review-candidate">
          <div class="suggestion-review-status">
            <p
              data-testid="suggestion-progress"
              data-current={index + 1}
              data-total={displayTotal}
              aria-live="polite"
              class="text-center text-sm text-gray-500 dark:text-gray-400"
            >
              {$t('face_suggestion_progress', { values: { current: index + 1, total: displayTotal } })}
            </p>

            {#if currentChoice}
              <p data-testid="suggestion-reviewed-badge" aria-live="polite" class="text-center text-sm font-semibold">
                {$t('face_suggestion_selected', { values: { choice: $t(choiceLabels[currentChoice]) } })}
                {#if currentSaved}
                  · {$t('saved')}{/if}
              </p>
            {/if}
          </div>

          <div class="suggestion-review-photo" bind:clientWidth={photoWidth} bind:clientHeight={photoHeight}>
            <img
              bind:this={imgEl}
              data-testid="suggestion-full-photo"
              src={photoUrl}
              alt={$t('face_suggestion_candidate')}
              class="absolute inset-0 size-full rounded-lg object-contain"
              onload={() => (imgReady = true)}
            />
            {#if highlight}
              <svg class="pointer-events-none absolute inset-0 size-full">
                <defs>
                  <mask id="suggestion-dim-mask">
                    <rect width="100%" height="100%" fill="white" />
                    <rect
                      x={highlight.left}
                      y={highlight.top}
                      width={highlight.width}
                      height={highlight.height}
                      rx="8"
                      fill="black"
                    />
                  </mask>
                </defs>
                <rect width="100%" height="100%" fill="rgba(0,0,0,0.55)" mask="url(#suggestion-dim-mask)" />
              </svg>
              <div
                data-testid="suggestion-highlight"
                class="pointer-events-none absolute rounded-lg border-3 border-solid border-white"
                style="top: {highlight.top}px; left: {highlight.left}px; width: {highlight.width}px; height: {highlight.height}px;"
              ></div>
            {:else}
              <div data-testid="suggestion-highlight-placeholder" class="hidden"></div>
            {/if}
          </div>

          <div class="flex min-w-0 flex-col gap-2">
            <SuggestionAssetSummary
              assetId={current.assetId}
              fileCreatedAt={current.fileCreatedAt}
              spaceId={page.params.spaceId}
            />
            <div class="mx-auto flex items-end gap-6">
              <div class="flex flex-col items-center gap-1">
                <img
                  data-testid="suggestion-reference"
                  src={referenceThumbnailUrl}
                  alt={$t('face_suggestion_reference')}
                  class="size-24 rounded-lg object-cover"
                />
                <span class="text-xs text-gray-500 dark:text-gray-400">{$t('face_suggestion_reference')}</span>
              </div>
              <div class="flex flex-col items-center gap-1">
                <div class="size-24">
                  <FaceCrop face={current} label={$t('face_suggestion_candidate')} />
                </div>
                <span class="text-xs text-gray-500 dark:text-gray-400">{$t('face_suggestion_candidate')}</span>
              </div>
            </div>
            {#if $faceSuggestionContextExpanded}
              <div class="max-h-40 overflow-y-auto overscroll-contain">
                <SuggestionAssetDetails assetId={current.assetId} spaceId={page.params.spaceId} class="mt-0" />
              </div>
            {/if}
          </div>
        </div>
      {:else if allDone}
        <div data-testid="suggestion-all-done" class="flex min-h-0 flex-1 flex-col items-center justify-center gap-2">
          <p class="text-center text-sm text-gray-500 dark:text-gray-400">
            {$t(choices.size === items.length ? 'face_suggestion_all_done' : 'face_suggestion_end')}
          </p>
        </div>
      {/if}
    </div>
  </ModalBody>

  <ModalFooter class="shrink-0">
    <div class="flex w-full flex-col gap-3">
      <div class="flex w-full items-center justify-between gap-2 sm:gap-3">
        <IconButton
          variant="ghost"
          shape="round"
          icon={mdiChevronLeft}
          aria-label={$t('previous')}
          aria-keyshortcuts="ArrowLeft ["
          disabled={busy || !canPrev}
          data-testid="suggestion-prev-btn"
          onclick={() => step(-1)}
        />
        <!--
        A single non-wrapping row of three labelled pills does not fit a phone, and the modal's @immich/ui Card
        is `overflow-hidden` — so the overflow CLIPPED the trailing (primary) button rather than scrolling it.
        Below `sm` the verdicts therefore stack full-width in the space between the two chevrons; from `sm` up
        `grow-0` + `flex-row` restores the original centred row exactly.
      -->
        <div
          data-testid="suggestion-actions"
          class="flex min-w-0 grow flex-col gap-2 sm:grow-0 sm:flex-row sm:justify-center sm:gap-3"
        >
          <Button
            class="w-full sm:w-auto"
            shape="round"
            color="secondary"
            disabled={busy || !current || currentSaved}
            aria-pressed={currentChoice === 'dismiss'}
            leadingIcon={mdiAccountRemoveOutline}
            data-testid="suggestion-different-btn"
            onclick={() => act('dismiss')}
          >
            {$t('face_suggestion_different')}
          </Button>
          <Button
            class="w-full sm:w-auto"
            shape="round"
            color="secondary"
            disabled={busy || !current || currentSaved}
            aria-pressed={currentChoice === 'ignore'}
            leadingIcon={mdiEyeOffOutline}
            data-testid="suggestion-ignore-btn"
            onclick={() => act('ignore')}
          >
            {$t('face_suggestion_ignore')}
          </Button>
          <Button
            class="w-full sm:w-auto"
            shape="round"
            disabled={busy || !current || currentSaved}
            aria-pressed={currentChoice === 'confirm'}
            leadingIcon={mdiAccountCheckOutline}
            data-testid="suggestion-same-btn"
            aria-keyshortcuts="Enter"
            onclick={() => act('confirm')}
          >
            {$t('face_suggestion_same')}
            <ShortcutKeycap key="Enter" />
          </Button>
        </div>
        <IconButton
          variant="ghost"
          shape="round"
          icon={mdiChevronRight}
          aria-label={$t('next')}
          aria-keyshortcuts="ArrowRight ]"
          disabled={busy || !canNext}
          data-testid="suggestion-next-btn"
          onclick={() => step(1)}
        />
      </div>

      <div class="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <p aria-live="polite" class="grid text-sm text-gray-600 dark:text-gray-300">
          <!-- Reserve the helper's space while the shorter saving progress is shown. -->
          <span class="col-start-1 row-start-1" class:invisible={saving} aria-hidden={saving}>
            {$t('face_suggestion_edit_until_save')}
          </span>
          {#if saving}
            <span class="col-start-1 row-start-1">
              {$t('face_suggestion_saving', { values: { current: saveCurrent, total: saveTotal } })}
            </span>
          {/if}
        </p>
        <Button
          color="secondary"
          class="shrink-0"
          disabled={loading || busy}
          data-testid="suggestion-save-btn"
          onclick={saveAndClose}
        >
          {$t('face_suggestion_save_and_close')}
        </Button>
      </div>
    </div>
  </ModalFooter>
</Modal>

<style>
  /* A viewport-sized frame keeps the footer at one screen position for every candidate and state. */
  :global(.person-suggestion-review) {
    height: 100dvh;
  }

  :global(.person-suggestion-review > div) {
    min-height: 0;
  }

  :global(.person-suggestion-review .person-suggestion-review-body) {
    flex: 1 1 0%;
    min-height: 0;
    height: auto;
  }

  .suggestion-review-content {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    height: 100%;
    min-height: 0;
  }

  .suggestion-review-candidate {
    display: grid;
    grid-template-rows: minmax(2.75rem, auto) minmax(6rem, 1fr) auto;
    gap: 1rem;
    flex: 1;
    min-height: 18rem;
  }

  .suggestion-review-status {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .suggestion-review-photo {
    position: relative;
    min-width: 0;
    min-height: 0;
  }

  @media (min-width: 40rem) {
    :global(.person-suggestion-review) {
      height: calc(100dvh - 2rem);
    }
  }
</style>
