<script lang="ts">
  // Local Omarchy layer: the move page, /moves?move=<id> (gallery/moves; MOVE-TO-LIBRARY.md D1 to D8), in the tab
  // the source library's Continue opened. It waits for the mover to know the move, then shows what comes and what
  // stays, and the owner confirms here, under this library's own session, which makes this library's key. Then the
  // move's progress, how it ended, the copies left unfinished here and, after a person's move, where this library's
  // face recognition put that person. Without ?move= it lists the moves that involve this library. Only where the
  // page conditions hold (move-gates); anyone else, and any vault's Gallery, goes to Photos.
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import UserPageLayout from '$lib/components/layouts/UserPageLayout.svelte';
  import { currentLibrary, isMainLibrary, libraryHas } from '$lib/gallery/libraries/library-context.svelte';
  import { authManager } from '$lib/managers/auth-manager.svelte';
  import { Route } from '$lib/route';
  import { getByteUnitString } from '$lib/utils/byte-units';
  import { Button } from '@immich/ui';
  import { onDestroy, onMount } from 'svelte';
  import { locale, t } from 'svelte-i18n';
  import MoveFaces from './MoveFaces.svelte';
  import MoveUnfinished from './MoveUnfinished.svelte';
  import { holdWords } from './hold-reasons';
  import { libraryById, movePageUrl, moverPageAllowed } from './move-gates';
  import { moveManager } from './move-manager.svelte';
  import {
    byteShare,
    endWords,
    errorWords,
    goingCount,
    moveNames,
    pauseWords,
    phaseWords,
    progressWords,
    quietHours,
    sideOf,
  } from './move-words';
  import { askFaces, isEnded, listMoves, MOVE_ID, MOVE_LIMIT, moveStatus, type MoveStatus } from './mover';

  /** The hand-off reaches the mover within moments of the click; the page waits a minute for it. */
  const WAIT_MS = 60_000;
  const FAST_MS = 500;
  const VISIBLE_MS = 2000;
  const HIDDEN_MS = 30_000;
  /** A face report is asked for at most once a minute, and read some seconds after. */
  const FACES_EVERY_MS = 60_000;
  const FACES_READ_MS = 15_000;
  const FACES_DAYS_MS = 7 * 24 * 3_600_000;

  const here = currentLibrary();
  const moveId = $derived(page.url.searchParams.get('move') ?? '');
  const valid = $derived(MOVE_ID.test(moveId));
  // the source the link names, for the words while the move is on its way; the mover's status says it for certain
  const from = $derived(libraryById(page.url.searchParams.get('from') ?? ''));

  let allowed = $state(false);
  let status = $state<MoveStatus>();
  let missing = $state(false);
  let moves = $state<MoveStatus[]>();
  let listFailed = $state(false);
  let force = $state<string[]>([]);
  let busy = $state(false);
  let note = $state<string>();

  let timer: ReturnType<typeof setTimeout> | undefined;
  let gone = false;
  let started = 0;
  let facesAskedAt = 0;

  const names = $derived(status ? moveNames(status) : { source: from?.name ?? '', library: here?.name ?? '' });
  const side = $derived(status ? sideOf(status, here?.id) : undefined);
  const sourceLibrary = $derived(status ? libraryById(status.source) : from);
  // the hours in which nothing is uploaded: by default only into Main, during its nightly backup
  const quiet = $derived(status ? quietHours(status, side === 'destination' && isMainLibrary()) : undefined);
  const bytes = (value: number) => getByteUnitString(value, $locale ?? undefined);
  const number = (value: number) => value.toLocaleString($locale ?? undefined);

  const title = $derived.by(() => {
    if (!valid) {
      return $t('moves_list_title');
    }
    if (status?.person) {
      return status.person.name
        ? $t('moves_page_title_person', { values: { ...names, name: status.person.name } })
        : $t('moves_page_title_person_unnamed', { values: names });
    }
    return $t('moves_page_title', { values: names });
  });

  // a person's move that ended done or cancelled in the last 7 days, whose report is not complete yet: photos still
  // to read, or faces read but not on anyone yet (the destination places most within minutes, the rest at night)
  const wantsFaces = (move: MoveStatus) =>
    !!move.person &&
    (move.state === 'done' || move.state === 'cancelled') &&
    Date.now() - Date.parse(move.endedAt ?? '') < FACES_DAYS_MS &&
    (!move.faces || move.faces.waiting > 0 || move.faces.unassigned > 0);

  const nextDelay = (): number | undefined => {
    if (!status) {
      return FAST_MS;
    }
    if (['checking', 'planning', 'starting'].includes(status.state)) {
      return FAST_MS;
    }
    const hidden = document.visibilityState === 'hidden';
    if (!isEnded(status.state)) {
      return hidden ? HIDDEN_MS : VISIBLE_MS;
    }
    return wantsFaces(status) && !hidden ? FACES_READ_MS : undefined;
  };

  const clearTimer = () => {
    if (timer !== undefined) {
      clearTimeout(timer);
      timer = undefined;
    }
  };

  const poll = async () => {
    clearTimer();
    if (gone) {
      return;
    }
    try {
      status = await moveStatus(moveId);
    } catch {
      // not known yet (the hand-off is on its way), or no answer: asked again below
    }
    if (gone) {
      return;
    }
    if (!status && Date.now() - started >= WAIT_MS) {
      missing = true;
      return;
    }
    if (status && wantsFaces(status) && document.visibilityState !== 'hidden') {
      const now = Date.now();
      if (now - facesAskedAt >= FACES_EVERY_MS) {
        facesAskedAt = now;
        void askFaces(status.move).catch(() => undefined);
      }
    }
    const delay = nextDelay();
    // one poll at a time: an action's poll and the timer's may both have been under way
    clearTimer();
    if (delay !== undefined) {
      timer = setTimeout(() => void poll(), delay);
    }
  };

  const onVisibility = () => {
    if (document.visibilityState === 'visible' && allowed && valid && !missing) {
      void poll();
    }
  };

  const loadList = async () => {
    try {
      moves = await listMoves();
    } catch {
      listFailed = true;
    }
  };

  onMount(() => {
    const owner = authManager.authenticated && !authManager.isSharedLink ? authManager.user : undefined;
    if (!moverPageAllowed(page.url, navigator.userAgent, owner)) {
      void goto(Route.photos(), { replaceState: true });
      return;
    }
    allowed = true;
    document.addEventListener('visibilitychange', onVisibility);
    if (valid) {
      started = Date.now();
      void poll();
    } else {
      void loadList();
    }
  });

  onDestroy(() => {
    gone = true;
    clearTimer();
    document.removeEventListener('visibilitychange', onVisibility);
  });

  const act = async (action: () => ReturnType<typeof moveManager.cancel>) => {
    if (!status) {
      return;
    }
    busy = true;
    note = undefined;
    const outcome = await action();
    if (outcome.kind === 'error') {
      note = errorWords($t, outcome.code, names);
    }
    await poll();
    busy = false;
  };

  // D3: this library's key and the holds ticked; the mover checks them (starting), then runs or says why not
  const confirm = () => {
    const move = status?.move;
    if (move) {
      void act(() => moveManager.confirm(move, force));
    }
  };
  const cancel = () => {
    const move = status?.move;
    if (move) {
      void act(() => moveManager.cancel(move));
    }
  };
  // D6: a fresh key for this library's side of a paused move
  const giveKey = () => {
    const move = status?.move;
    const mine = side;
    if (move && mine) {
      void act(() => moveManager.giveKey(move, mine));
    }
  };

  const toggleForce = (reason: string, on: boolean) => {
    force = on ? [...new Set([...force, reason])] : force.filter((item) => item !== reason);
  };

  const going = $derived(status ? goingCount(status, force) : 0);
</script>

<UserPageLayout {title}>
  <div class="ws-move-page" data-testid="move-page">
    {#if !allowed}
      <!-- the page conditions are checked once mounted; until then, and when they fail, nothing is asked -->
    {:else if !valid}
      <section class="ws-move-frame" data-testid="move-list">
        {#if listFailed}
          <p class="ws-move-part" role="alert">{$t('moves_mover_missing')}</p>
        {:else if !moves}
          <p class="ws-move-part" role="status">{$t('loading')}</p>
        {:else if moves.length === 0}
          <p class="ws-move-part ws-move-muted">{$t('moves_list_empty')}</p>
        {:else}
          <ul>
            {#each moves as move (move.move)}
              {@const moveSide = sideOf(move, here?.id)}
              <li class="ws-move-part">
                <a href={`/moves?move=${move.move}`} class="ws-move-row">
                  <span class="ws-move-row-words">
                    {isEnded(move.state) ? endWords($t, move, moveSide)[0] : progressWords($t, move, moveSide)}
                  </span>
                  {#if move.endedAt || move.createdAt}
                    <span class="ws-move-data">
                      {new Date(move.endedAt ?? move.createdAt ?? '').toLocaleString($locale ?? undefined, {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      })}
                    </span>
                  {/if}
                </a>
              </li>
            {/each}
          </ul>
        {/if}
      </section>
    {:else if !status}
      <section class="ws-move-frame">
        {#if missing}
          <p class="ws-move-part" role="alert">
            {names.source ? $t('moves_nothing_arrived', { values: names }) : $t('moves_nothing_arrived_any')}
          </p>
        {:else}
          <p class="ws-move-part" role="status">
            {names.source ? $t('moves_waiting_for', { values: names }) : $t('moves_waiting')}
          </p>
        {/if}
      </section>
    {:else}
      {@const plan = status.plan}
      <section class="ws-move-frame" data-state={status.state}>
        {#if status.state === 'checking' || status.state === 'planning'}
          <p class="ws-move-part" role="status">{$t('moves_reading', { values: names })}</p>
        {:else if isEnded(status.state)}
          <div class="ws-move-part">
            {#each endWords($t, status, side) as line, index (index)}
              <p class:ws-move-lead={index === 0}>{line}</p>
            {/each}
            {#if status.state === 'done' && side === 'destination'}
              <p><a class="ws-move-link" href={Route.recentlyAdded()}>{$t('moves_recently_added')}</a></p>
            {/if}
          </div>
        {:else if plan && (status.state === 'ready' || status.state === 'starting')}
          <div class="ws-move-part">
            <p class="ws-move-lead">
              {#if sourceLibrary}
                <span class="ws-move-swatch" style:--ws-library={sourceLibrary.colour} aria-hidden="true"></span>
              {/if}
              {$t('moves_summary', { values: { ...names, count: plan.items, size: bytes(plan.bytes) } })}
            </p>
            <p>{$t('moves_summary_new', { values: { ...names, count: plan.new } })}</p>
            {#if plan.present > 0}
              <p>
                {$t('moves_summary_present', { values: { ...names, count: plan.present } })}
                {$t('moves_summary_present_kept', { values: names })}
              </p>
            {/if}
            {#if status.person?.archived}
              <p data-testid="move-archived-note">{$t('moves_summary_archived')}</p>
            {/if}
            {#if status.person && plan.gone > 0}
              <p>{$t('moves_summary_gone', { values: { ...names, count: plan.gone } })}</p>
            {/if}
            {#if plan.remaining > 0}
              <p class="ws-move-muted">{$t('moves_person_rest', { values: { max: MOVE_LIMIT } })}</p>
            {/if}
          </div>
          {#if status.holds.length > 0}
            <div class="ws-move-part" data-testid="move-holds">
              <p>{$t('moves_summary_held', { values: { ...names, count: plan.held } })}</p>
              <ul class="ws-move-holds">
                {#each status.holds as hold (hold.reason)}
                  <li>
                    <span class="ws-move-hold-words">{holdWords($t, hold.reason, names)}</span>
                    <span class="ws-move-data">{number(hold.items)}</span>
                    {#if hold.forceable}
                      <label class="ws-move-force">
                        <input
                          type="checkbox"
                          checked={force.includes(hold.reason)}
                          disabled={busy || status.state === 'starting'}
                          onchange={(event) => toggleForce(hold.reason, event.currentTarget.checked)}
                          data-testid={`move-force-${hold.reason}`}
                        />
                        {$t('moves_force')}
                      </label>
                    {/if}
                  </li>
                {/each}
              </ul>
            </div>
          {/if}
          <div class="ws-move-part ws-move-muted">
            {#if status.space}
              <p>
                {$t('moves_summary_space', {
                  values: { needed: bytes(status.space.needed), free: bytes(status.space.free) },
                })}
              </p>
            {/if}
            <p data-testid="move-busy-note">
              {$t('moves_busy_after', { values: names })}
              {#if libraryHas('curator')}
                {$t('moves_busy_curator')}
              {/if}
              {#if quiet}
                {$t('moves_quiet_hours', { values: { ...names, from: quiet.from, to: quiet.to } })}
              {/if}
            </p>
            {#if plan.sourceShares}
              <p data-testid="move-source-shares">
                {$t('moves_source_shares', {
                  values: {
                    ...names,
                    links: plan.sourceShares.sharedLinks,
                    spaces: plan.sourceShares.spaces,
                    albums: plan.sourceShares.sharedAlbums,
                    memories: plan.sourceShares.memories,
                  },
                })}
              </p>
            {/if}
            {#if status.trashDays}
              <p>{$t('moves_summary_trash', { values: { ...names, days: status.trashDays } })}</p>
            {/if}
          </div>
          {#if status.refusal && status.state === 'ready'}
            <p class="ws-move-part" role="alert">{errorWords($t, status.refusal.code, names)}</p>
          {/if}
          {#if side === 'destination'}
            <div class="ws-move-part ws-move-actions">
              <Button shape="round" color="secondary" disabled={busy} onclick={cancel}>
                {$t('moves_not_now')}
              </Button>
              <Button
                shape="round"
                disabled={busy || status.state === 'starting' || going === 0}
                onclick={confirm}
                data-testid="move-confirm"
              >
                {busy || status.state === 'starting'
                  ? $t('moves_checking')
                  : $t('moves_confirm', { values: { ...names, count: going } })}
              </Button>
            </div>
          {:else if side === 'source' && here}
            {@const destination = libraryById(status.destination)}
            <div class="ws-move-part">
              <p>{$t('moves_confirm_there', { values: names })}</p>
              {#if destination}
                <a class="ws-move-link" href={movePageUrl(destination, status.move, here.id)}
                  >{$t('moves_open', { values: names })}</a
                >
              {/if}
            </div>
          {/if}
        {:else}
          <!-- running or paused (D4, D6) -->
          <div class="ws-move-part ws-move-running">
            <p class="ws-move-lead">{progressWords($t, status, side)}</p>
            {#if status.state === 'paused'}
              <p>{$t('moves_paused', { values: { reason: pauseWords($t, status) } })}</p>
              {#if side === 'destination' && status.needs.includes('source')}
                <p class="ws-move-muted">{$t('moves_needs_key', { values: { library: names.source } })}</p>
              {/if}
            {:else}
              {@const phase = phaseWords($t, status)}
              {#if phase}
                <p class="ws-move-muted">{phase}</p>
              {/if}
            {/if}
            {#if status.state === 'running'}
              <span class="ws-move-bar" style:--done={byteShare(status)} aria-hidden="true"></span>
            {/if}
          </div>
          <div class="ws-move-part ws-move-actions">
            {#if status.state === 'paused' && side && status.needs.includes(side)}
              <Button shape="round" disabled={busy} onclick={giveKey} data-testid="move-continue-key">
                {$t('moves_continue')}
              </Button>
            {/if}
            <Button shape="round" color="secondary" disabled={busy} onclick={cancel}>
              {$t('moves_cancel')}
            </Button>
          </div>
        {/if}
        {#if note}
          <p class="ws-move-part" role="alert">{note}</p>
        {/if}
      </section>
      {#if side === 'destination' && status.unfinished.length > 0}
        <section class="ws-move-frame">
          <div class="ws-move-part">
            <MoveUnfinished ids={status.unfinished} {names} />
          </div>
        </section>
      {/if}
      {#if side === 'destination' && status.person && status.faces && isEnded(status.state)}
        <section class="ws-move-frame">
          <div class="ws-move-part">
            <MoveFaces report={status.faces} {names} />
          </div>
        </section>
      {/if}
    {/if}
  </div>
</UserPageLayout>

<style>
  .ws-move-page {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    width: 100%;
    max-width: 40rem;
    padding-bottom: 2rem;
    font-size: var(--ws-text-ui);
    line-height: 1.5;
    font-variant-numeric: tabular-nums;
  }
  /* one frame on the theme's corners, its parts split by hairlines that run edge to edge */
  .ws-move-frame {
    position: relative;
    border: 1px solid var(--ws-hairline);
    border-radius: var(--ws-radius);
    overflow: hidden;
  }
  .ws-move-part {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    padding: 0.75rem 1rem;
  }
  .ws-move-part + .ws-move-part,
  .ws-move-frame > ul > li + li {
    border-top: 1px solid var(--ws-hairline);
  }
  .ws-move-lead {
    font-weight: 600;
  }
  .ws-move-muted {
    color: var(--immich-ui-muted);
  }
  .ws-move-swatch {
    display: inline-block;
    width: 0.625rem;
    height: 0.625rem;
    margin-inline-end: 0.375rem;
    background: var(--ws-library);
  }
  .ws-move-data {
    flex: none;
    font-family: var(--ws-font-data);
    font-size: var(--ws-text-data);
    font-variant-numeric: tabular-nums;
    color: var(--immich-ui-muted);
  }
  .ws-move-holds li {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem 0.75rem;
    align-items: baseline;
    padding: 0.25rem 0;
  }
  .ws-move-hold-words {
    flex: 1 1 16rem;
    min-width: 0;
  }
  .ws-move-force {
    display: inline-flex;
    gap: 0.375rem;
    align-items: center;
    font-size: var(--ws-text-meta);
    font-weight: 500;
  }
  .ws-move-actions {
    flex-direction: row;
    flex-wrap: wrap;
    gap: 0.5rem;
    justify-content: flex-end;
  }
  .ws-move-row {
    display: flex;
    gap: 0.75rem;
    align-items: baseline;
    justify-content: space-between;
    color: inherit;
    text-decoration: none;
  }
  .ws-move-row:hover .ws-move-row-words {
    text-decoration: underline;
    text-decoration-color: var(--ws-accent);
    text-underline-offset: 0.2em;
  }
  .ws-move-link {
    font-weight: 600;
    color: var(--immich-ui-dark);
    text-decoration: underline;
    text-decoration-color: var(--ws-hairline);
    text-underline-offset: 0.2em;
  }
  .ws-move-link:hover {
    text-decoration-color: var(--ws-accent);
  }
  .ws-move-row:focus-visible,
  .ws-move-link:focus-visible {
    outline: var(--ws-border) solid var(--ws-accent);
    outline-offset: 2px;
  }
  .ws-move-running {
    position: relative;
  }
  /* the bytes gone so far: one hairline in the accent along the part's foot */
  .ws-move-bar {
    position: absolute;
    inset-inline-start: 0;
    bottom: 0;
    width: calc(var(--done, 0) * 100%);
    height: 1px;
    background: var(--ws-accent);
    transition: width 400ms ease-out;
  }
  @media (prefers-reduced-motion: reduce) {
    .ws-move-bar {
      transition: none;
    }
  }
</style>
