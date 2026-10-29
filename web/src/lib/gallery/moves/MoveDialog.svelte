<script lang="ts">
  // Local Omarchy layer: Move to <library>'s dialog (gallery/moves; MOVE-TO-LIBRARY.md S2 and S3), for a selection or
  // a person's photos. It says what goes and what stays, and asks the mover what is under way before anything is
  // made. A person's move takes their timeline; their archived photos (often a clean-up's leftovers) stay unless the
  // owner ticks them in (the owner, 30 October). Continue in <library> opens the destination's move page in a new tab
  // inside the click, so no pop-up blocker stands in the way, and only then makes the source key and hands the move
  // over; the owner confirms it there.
  import { AssetVisibility, getPersonStatistics, searchAssetStatistics } from '@immich/sdk';
  import { Button, HStack, Modal, ModalBody, ModalFooter } from '@immich/ui';
  import { mdiImageMove } from '@mdi/js';
  import { onDestroy, onMount } from 'svelte';
  import { t } from 'svelte-i18n';
  import { currentLibrary, isMainLibrary } from '$lib/gallery/libraries/library-context.svelte';
  import type { Library } from '$lib/gallery/libraries/library-file';
  import { serverConfigManager } from '$lib/managers/server-config-manager.svelte';
  import { movePageUrl } from './move-gates';
  import { beginMove, moveManager, type MoveRequest } from './move-manager.svelte';
  import { errorWords, progressWords, sideOf } from './move-words';
  import { isEnded, listMoves, MOVE_LIMIT, moveStatus, type MoverErrorCode, type MoveStatus } from './mover';

  type Props = { request: MoveRequest; destination: Library; onClose: () => void };

  let { request, destination, onClose }: Props = $props();

  /** The mover checks a hand-off in 5 s at most; the dialog waits a little longer for its outcome. */
  const CHECK_WAIT_MS = 12_000;
  const CHECK_EVERY_MS = 500;

  const here = currentLibrary();
  const names = $derived({ source: here?.name ?? '', library: destination.name });
  const person = $derived(request.person);
  const trashDays = (() => {
    try {
      return serverConfigManager.value.trashDays;
    } catch {
      return;
    }
  })();

  // what the mover says before anything is made: not running, a move under way, or ready
  let probe = $state<'probing' | 'missing' | 'busy' | 'ready'>('probing');
  let underWay = $state<MoveStatus>();
  // a person's photos as the person's page counts them (their timeline), and their archived ones, which stay unless
  // ticked in (null: not counted, the tick then says no number)
  let personCount = $state<number>();
  let archivedCount = $state<number | null>();
  let withArchived = $state(false);

  type Stage =
    | { step: 'choosing' }
    | { step: 'checking'; move: string }
    | { step: 'handed'; move: string }
    | { step: 'refused'; words: string }
    | { step: 'busy' }
    | { step: 'error'; code: MoverErrorCode };
  let stage = $state<Stage>({ step: 'choosing' });
  let gone = false;

  const count = $derived(request.kind === 'selection' ? request.ids.length : personCount);
  const tooMany = $derived(request.kind === 'selection' && request.ids.length > MOVE_LIMIT);
  const canContinue = $derived(stage.step === 'choosing' && probe === 'ready' && !tooMany);
  // the tick for a person's archived photos, unless the count says there are none
  const offersArchived = $derived(request.kind === 'person' && archivedCount !== undefined && archivedCount !== 0);
  // a person's photos beyond the first 50,000 wait for their next move
  const personTotal = $derived((personCount ?? 0) + (withArchived ? (archivedCount ?? 0) : 0));

  const title = $derived.by(() => {
    if (request.kind === 'selection') {
      return $t('moves_dialog_title', { values: names });
    }
    return request.person.name
      ? $t('moves_dialog_title_person', { values: { ...names, name: request.person.name } })
      : $t('moves_dialog_title_person_unnamed', { values: names });
  });

  onMount(async () => {
    if (request.kind === 'person') {
      void getPersonStatistics({ id: request.person.id })
        .then(({ assets }) => (personCount = assets))
        .catch(() => undefined);
      void searchAssetStatistics({
        statisticsSearchDto: { personIds: [request.person.id], visibility: AssetVisibility.Archive },
      })
        .then(({ total }) => (archivedCount = total))
        .catch(() => (archivedCount = null));
    }
    try {
      const moves = await listMoves();
      underWay = moves.find(({ state }) => !isEnded(state));
      probe = underWay ? 'busy' : 'ready';
    } catch {
      probe = 'missing';
    }
  });

  onDestroy(() => {
    gone = true;
  });

  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  // the mover checks the hand-off in a thread of its own; the dialog says how that ended
  const waitForChecks = async (move: string) => {
    const deadline = Date.now() + CHECK_WAIT_MS;
    while (!gone && Date.now() < deadline) {
      try {
        const status = await moveStatus(move);
        if (status.state === 'refused') {
          stage = { step: 'refused', words: errorWords($t, status.reason ?? 'failed', names) };
          return;
        }
        if (status.state !== 'checking') {
          break;
        }
      } catch {
        // asked again below
      }
      await sleep(CHECK_EVERY_MS);
    }
    stage = { step: 'handed', move };
  };

  const handOver = async (move: string) => {
    const asked: MoveRequest = request.kind === 'person' ? { ...request, archived: withArchived } : request;
    const outcome = await moveManager.handOff(move, asked, destination);
    if (outcome.kind === 'busy') {
      stage = { step: 'busy' };
    } else if (outcome.kind === 'error') {
      stage = { step: 'error', code: outcome.code };
    } else {
      stage = { step: 'checking', move };
      await waitForChecks(move);
    }
  };

  // S3: the tab first, inside the click; the key and the hand-off after it, without waiting in the click
  const continueMove = () => {
    if (!canContinue) {
      return;
    }
    const move = beginMove(destination);
    if (!move) {
      stage = { step: 'error', code: 'failed' };
      return;
    }
    stage = { step: 'checking', move };
    void handOver(move);
  };
</script>

<Modal {title} icon={mdiImageMove} {onClose} size="small">
  <ModalBody>
    <div class="ws-move-dialog" data-testid="move-dialog">
      {#if stage.step === 'choosing'}
        {#if request.kind === 'selection'}
          <p>{$t('moves_dialog_count', { values: { ...names, count } })}</p>
          {#if request.notOwned > 0}
            <p>{$t('moves_not_owned', { values: { count: request.notOwned } })}</p>
          {/if}
        {:else if count !== undefined}
          <p>
            {request.person.name
              ? $t('moves_dialog_count_person', { values: { ...names, count, name: request.person.name } })
              : $t('moves_dialog_count_person_unnamed', { values: { ...names, count } })}
          </p>
        {/if}
        {#if person}
          <p>{$t('moves_group_photos')}</p>
        {/if}
        {#if offersArchived}
          <label class="ws-move-tick">
            <input type="checkbox" bind:checked={withArchived} data-testid="move-archived" />
            <span>
              {archivedCount
                ? $t('moves_include_archived', { values: { count: archivedCount } })
                : $t('moves_include_archived_any')}
            </span>
          </label>
        {/if}
        <p>{$t('moves_dialog_carried', { values: names })}</p>
        {#if trashDays !== undefined}
          <p>{$t('moves_dialog_trash', { values: { ...names, days: trashDays } })}</p>
        {/if}
        {#if isMainLibrary()}
          <p>{$t('moves_source_shares_dialog', { values: { library: here?.name ?? '' } })}</p>
        {/if}
        {#if request.kind === 'person' && personTotal > MOVE_LIMIT}
          <p class="ws-move-note">{$t('moves_person_rest', { values: { max: MOVE_LIMIT } })}</p>
        {/if}
        {#if tooMany}
          <p class="ws-move-note" role="alert">{$t('moves_too_many', { values: { max: MOVE_LIMIT } })}</p>
        {/if}
        {#if probe === 'missing'}
          <p class="ws-move-note" role="alert">{$t('moves_mover_missing')}</p>
        {:else if probe === 'busy' && underWay}
          <p class="ws-move-note" role="status">
            {$t('moves_busy')}
            {progressWords($t, underWay, sideOf(underWay, here?.id))}
          </p>
        {/if}
      {:else if stage.step === 'checking'}
        <p role="status">{$t('moves_checking')}</p>
      {:else if stage.step === 'handed'}
        <p role="status">{$t('moves_confirm_there', { values: names })}</p>
      {:else if stage.step === 'refused'}
        <p role="alert">{stage.words}</p>
      {:else if stage.step === 'busy'}
        <p role="alert">{$t('moves_busy')}</p>
      {:else}
        <p role="alert">{errorWords($t, stage.code, names)}</p>
      {/if}
    </div>
  </ModalBody>
  <ModalFooter>
    <HStack fullWidth>
      {#if stage.step === 'choosing'}
        <Button shape="round" color="secondary" fullWidth onclick={onClose}>{$t('cancel')}</Button>
        <Button shape="round" fullWidth disabled={!canContinue} onclick={continueMove} data-testid="move-continue">
          {$t('moves_continue_in', { values: names })}
        </Button>
      {:else}
        <Button shape="round" color="secondary" fullWidth onclick={onClose}>{$t('close')}</Button>
        {#if stage.step === 'handed' && here}
          <Button shape="round" fullWidth href={movePageUrl(destination, stage.move, here.id)} data-testid="move-open">
            {$t('moves_open', { values: names })}
          </Button>
        {/if}
      {/if}
    </HStack>
  </ModalFooter>
</Modal>

<style>
  .ws-move-dialog {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    font-size: var(--ws-text-ui, 0.875rem);
    line-height: 1.5;
  }
  .ws-move-note {
    font-size: var(--ws-text-meta, 0.8125rem);
    color: var(--immich-ui-muted);
  }
  /* a person's archived photos: one plain tick, off until the owner asks for them */
  .ws-move-tick {
    display: flex;
    gap: 0.5rem;
    align-items: baseline;
    font-variant-numeric: tabular-nums;
    cursor: pointer;
  }
  .ws-move-tick input {
    flex: none;
  }
</style>
