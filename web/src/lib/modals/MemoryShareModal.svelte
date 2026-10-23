<script lang="ts">
  // Local Omarchy layer: Share memory, as a postcard ("Postcard: say it, then share", the owner, 2026-10-23, for the
  // critique's P1). One sentence at the top says what a link shares, worded from the choices as they change: who
  // (anyone with the link, and its password once one is set), what (this memory's photos and its music as a film, or
  // one video file) and when the link ends, in the words Shared links says it in (utils/shared-link-words: "The link
  // ends Nov 22.", "… in 5 days.", "… never ends."). Then the format, how long the link stays open as the layer's
  // segmented control (30 days chosen, as on every link the Share sheets make: shareLinkExpiry), a switch that adds a
  // password, and one action, Make a link; a video format also downloads its file, which shares nothing. The link made
  // shows in place with its QR, Copy, Edit and Turn off (components/omarchy/ShareLinkPanel), under a receipt worded
  // from the link Gallery holds (its password, its end) and Curator's count; a memory already shared opens on its live
  // link. A failure names its step: the video, keeping it to share, Gallery's link, Curator's film for the link,
  // turning it off.
  import OnEvents from '$lib/components/OnEvents.svelte';
  import ShareLinkPanel from '$lib/components/omarchy/ShareLinkPanel.svelte';
  import {
    liveMemoryLinks,
    MEMORY_LINK_DAYS,
    memoryLinkDuration,
    memoryLinkExpiry,
    memoryVideoAspect,
    type MemoryLinkDays,
    type MemoryLinkKind,
    type MemoryPresentation,
    type MemoryShareMode,
  } from '$lib/components/memories/memory-sharing';
  import GroupTab from '$lib/elements/GroupTab.svelte';
  import { eventManager } from '$lib/managers/event-manager.svelte';
  import { filmVideos } from '$lib/managers/film-video-manager.svelte';
  import { Route } from '$lib/route';
  import { asUrl, makeSharedLink, SHARE_LINK_DAYS } from '$lib/services/shared-link.service';
  import { locale } from '$lib/stores/preferences.store';
  import { copyToClipboard } from '$lib/utils';
  import { curator, FILM_MOST_SECONDS, type FilmRequest } from '$lib/utils/curator';
  import { serverDetail } from '$lib/utils/handle-error';
  import { filmPhotoCount } from '$lib/utils/memory-title';
  import { linkEnd, linkEndDay } from '$lib/utils/shared-link-words';
  import {
    getAllSharedLinks,
    getSharedLinkById,
    isHttpError,
    removeSharedLink,
    SharedLinkType,
    type SharedLinkResponseDto,
  } from '@immich/sdk';
  import { Field, Icon, Modal, ModalBody, ModalFooter, modalManager, PasswordInput, Switch } from '@immich/ui';
  import { mdiCellphone, mdiMonitor, mdiOpenInNew, mdiPlayCircleOutline, mdiShareVariant } from '@mdi/js';
  import { onDestroy, onMount, tick } from 'svelte';
  import { t } from 'svelte-i18n';

  interface Props {
    memoryId: string;
    presentation: MemoryPresentation;
    getVideo: (aspect: number) => FilmRequest | undefined;
    initialMode?: MemoryShareMode;
    onClose: () => void;
  }

  let { memoryId, presentation, getVideo, initialMode = 'memory', onClose }: Props = $props();

  /** the step that failed: the video (made, or kept to share), Gallery's link, Curator's film for it, turning it off */
  type Step = 'video' | 'keep' | 'link' | 'film' | 'off';

  // svelte-ignore state_referenced_locally
  let mode = $state<MemoryShareMode>(initialMode);
  let days = $state<MemoryLinkDays>(SHARE_LINK_DAYS);
  let protect = $state(false);
  let password = $state('');
  let passwordMissing = $state(false);
  let passwordBox = $state<HTMLElement>();
  let busy = $state<'video' | 'link' | 'off'>();
  let failure = $state<{ step: Step; reason?: string }>();
  // the link the sheet shows: made here, or found open when the sheet opened; and what it shares
  let link = $state<SharedLinkResponseDto>();
  let kind = $state<MemoryLinkKind>('memory');
  let count = $state<number>();
  let withMusic = $state(false);
  let found = $state(false);
  // this memory's other links still open (Shared links lists them)
  let others = $state(0);
  // Share memory looks for a link already open first; Save as video goes straight to the choices
  // svelte-ignore state_referenced_locally
  let view = $state<'looking' | 'choose' | 'shared' | 'off'>(initialMode === 'memory' ? 'looking' : 'choose');
  let canShare = $state(false);
  let closed = false;

  const choices = [
    {
      value: 'memory',
      icon: mdiPlayCircleOutline,
      title: 'memory_share_playable',
      detail: 'memory_share_playable_hint',
    },
    { value: 'portrait', icon: mdiCellphone, title: 'memory_share_portrait', detail: 'memory_share_portrait_hint' },
    { value: 'landscape', icon: mdiMonitor, title: 'memory_share_landscape', detail: 'memory_share_landscape_hint' },
  ] as const;

  const expiryValue = (choice: MemoryLinkDays) => (choice === null ? 'never' : String(choice));
  const expiryLabels = $derived(
    MEMORY_LINK_DAYS.map((choice) => (choice === null ? $t('never') : memoryLinkDuration(choice, $locale))),
  );

  // the film as the chosen frame would save it: a film past Curator's length is said before anything is pressed
  const video = $derived(mode === 'memory' ? undefined : getVideo(memoryVideoAspect(mode)));
  const tooLong = $derived(!!video && video.plan.duration > FILM_MOST_SECONDS);
  const progress = $derived(
    filmVideos.items.find((item) => item.request.memoryId === memoryId && item.status === 'making'),
  );
  const percent = $derived(
    progress ? new Intl.NumberFormat($locale, { style: 'percent' }).format(progress.progress) : '',
  );

  /** when the link ends, as a sentence in the Shared links page's words: by calendar days ("today", "tomorrow", "in 5
   * days"), then the day ("Nov 22"), or never. A day written with an abbreviation's full stop ("am 22. Nov.") ends the
   * sentence with it, not with a second one. */
  const endSentence = (expiresAt: string | null) => {
    const end = linkEnd(expiresAt);
    const when = end.state === 'ends' ? end.when : end.state;
    return $t('memory_share_scope_end', {
      values: {
        when,
        days: end.state === 'ends' ? end.days : 0,
        date: end.state === 'never' ? '' : linkEndDay(end.date, $locale),
      },
    }).replace(/\.\.$/, '.');
  };
  /** who sees what, and when the link ends: one sentence and its end */
  const scope = (
    what: MemoryLinkKind,
    facts: { password: boolean; expiresAt: string | null; count: number; music: boolean },
  ) =>
    `${$t(what === 'memory' ? 'memory_share_scope_film' : 'memory_share_scope_video', {
      values: { password: facts.password ? 'yes' : 'no', count: facts.count, music: facts.music ? 'yes' : 'no' },
    })} ${endSentence(facts.expiresAt)}`;

  // what a link made now would share, from the choices
  const planned = $derived(
    scope(mode === 'memory' ? 'memory' : 'video', {
      password: protect && password.length > 0,
      expiresAt: memoryLinkExpiry(days),
      count: presentation.assetIds.length,
      music: presentation.trackIds.length > 0,
    }),
  );
  // what the link shares, from the link as Gallery holds it (its password, its end) and the photos its film plays
  const receipt = $derived(
    link
      ? scope(kind, {
          password: !!link.password,
          expiresAt: link.expiresAt,
          count: count ?? presentation.assetIds.length,
          music: withMusic,
        })
      : '',
  );

  onMount(() => {
    filmVideos.shareDialogOpen = true;
    // eslint-disable-next-line tscompat/tscompat -- feature detected; unsupported browsers copy the link
    canShare = typeof navigator.share === 'function';
    if (view === 'looking') {
      void lookUp();
    }
  });
  onDestroy(() => {
    closed = true;
    filmVideos.shareDialogOpen = false;
  });

  // a memory already shared opens on its newest link still open (one request, the owner's links; then that link, for
  // how many photos its film plays); not finding one, or not being able to look, leaves the choices
  const lookUp = async () => {
    try {
      const open = liveMemoryLinks(await getAllSharedLinks({}), presentation);
      const [newest] = open;
      if (newest && !closed) {
        let shown = newest.link;
        if (newest.kind === 'memory') {
          try {
            shown = await getSharedLinkById({ id: newest.link.id });
            count = filmPhotoCount(shown.assets);
          } catch {
            // the sentence counts the memory's photos instead
          }
        }
        link = shown;
        kind = newest.kind;
        others = open.length - 1;
        found = true;
        view = 'shared';
        return;
      }
    } catch {
      // Shared links still lists every link
    }
    view = 'choose';
  };

  /** a step that failed with nothing more to tell than which step it was */
  class Unexplained extends Error {
    constructor() {
      super('unexplained');
    }
  }

  /** the reason a step failed, when there is one to tell: the server's (Gallery), or Curator's own words */
  const reasonOf = (error: unknown, said: string) => {
    if (error instanceof Unexplained) {
      return;
    }
    if (isHttpError(error)) {
      return serverDetail(error, said);
    }
    const message = error instanceof Error ? error.message.trim() : '';
    return message && message !== said ? message.slice(0, 140) : undefined;
  };

  const FAILED = {
    video: 'memory_share_video_failed',
    keep: 'memory_share_keep_failed',
    link: 'memory_share_link_failed',
    film: 'memory_share_film_failed',
    off: 'memory_share_turn_off_failed',
  } as const;
  const failed = (step: Step) => $t(FAILED[step]);

  const prepareVideo = async () => {
    if (mode === 'memory' || !video) {
      throw new Unexplained();
    }
    if (tooLong) {
      throw new Error($t('memory_film_too_long'));
    }
    const label = `${presentation.title} · ${$t(mode === 'portrait' ? 'memory_share_portrait' : 'memory_share_landscape')}`;
    return filmVideos.prepare({ ...video, title: label, size: '720p' }, label);
  };

  // the file alone, saved by the browser: nothing is shared
  const download = async () => {
    if (busy) {
      return;
    }
    busy = 'video';
    failure = undefined;
    try {
      const item = await prepareVideo();
      if (!closed) {
        filmVideos.save(item);
      }
    } catch (error) {
      failure = { step: 'video', reason: reasonOf(error, failed('video')) };
    } finally {
      busy = undefined;
    }
  };

  const makeLink = async () => {
    if (busy) {
      return;
    }
    if (protect && !password) {
      passwordMissing = true;
      focusPassword();
      return;
    }
    failure = undefined;
    const what: MemoryLinkKind = link ? kind : mode === 'memory' ? 'memory' : 'video';
    let step: Step = what === 'memory' ? 'link' : 'video';
    try {
      // a link made already (Curator failed for it) is kept: trying again never makes a second public link
      if (!link) {
        let assetIds = presentation.assetIds;
        if (what === 'video') {
          busy = 'video';
          const item = await prepareVideo();
          if (closed) {
            return;
          }
          step = 'keep';
          busy = 'link';
          if (!item.assetId) {
            const kept = await curator.keepFilm(item.jobId!);
            item.assetId = kept.assetId;
          }
          assetIds = [item.assetId];
        }
        if (closed) {
          return;
        }
        step = 'link';
        busy = 'link';
        const made = await makeSharedLink(
          {
            type: SharedLinkType.Individual,
            assetIds,
            description: presentation.title,
            expiresAt: memoryLinkExpiry(days),
            password: protect ? password : undefined,
            allowUpload: false,
            allowDownload: what === 'video',
            // Rendered MP4s have no source EXIF/GPS. Gallery requires this for MP4 downloads.
            showMetadata: what === 'video',
          },
          { rethrow: true },
        );
        if (!made) {
          throw new Unexplained();
        }
        link = made;
        kind = what;
      }
      if (what === 'memory') {
        step = 'film';
        busy = 'link';
        const film = await curator.shareMemory(memoryId, { linkId: link.id, key: link.key, presentation });
        // Curator takes every song or refuses the link, so the film's music is the one asked for
        count = film.count;
        withMusic = presentation.trackIds.length > 0;
      }
      found = false;
      view = 'shared';
    } catch (error) {
      failure = { step, reason: reasonOf(error, failed(step)) };
    } finally {
      busy = undefined;
    }
  };

  // Turn off deletes the link: whoever has it can no longer open the memory (the player asks Gallery on every request)
  const turnOff = async () => {
    if (!link || busy) {
      return;
    }
    const confirmed = await modalManager.showDialog({
      title: $t('memory_share_turn_off_title'),
      prompt: $t('memory_share_turn_off_prompt'),
      confirmText: $t('share_link_turn_off'),
    });
    if (!confirmed || !link) {
      return;
    }
    const gone = link;
    busy = 'off';
    failure = undefined;
    try {
      await removeSharedLink({ id: gone.id });
      eventManager.emit('SharedLinkDelete', gone);
      wentOff(gone);
    } catch (error) {
      failure = { step: 'off', reason: reasonOf(error, failed('off')) };
    } finally {
      busy = undefined;
    }
  };

  const wentOff = (gone: SharedLinkResponseDto) => {
    if (gone.id !== link?.id) {
      return;
    }
    link = undefined;
    count = undefined;
    view = 'off';
  };

  // a fresh start from the choices: a new link of either kind, or the file alone; a link left for them stays on
  const startOver = () => {
    if (view === 'shared' && link) {
      others += 1;
    }
    link = undefined;
    count = undefined;
    found = false;
    failure = undefined;
    view = 'choose';
  };

  // the system's share sheet where there is one (a phone), else the address copied
  const send = async () => {
    if (!link) {
      return;
    }
    const url = asUrl(link);
    try {
      // eslint-disable-next-line tscompat/tscompat -- guarded by canShare
      await navigator.share({ title: presentation.title, url });
    } catch (error) {
      if ((error as Error).name !== 'AbortError') {
        await copyToClipboard(url);
      }
    }
  };

  const focusPassword = () => passwordBox?.querySelector('input')?.focus();

  const setProtect = async (on: boolean) => {
    protect = on;
    passwordMissing = false;
    if (on) {
      await tick();
      focusPassword();
    }
  };
</script>

<OnEvents
  onSharedLinkUpdate={(updated) => {
    if (updated.id === link?.id) {
      link = updated;
    }
  }}
  onSharedLinkDelete={wentOff}
/>

<!-- this memory's other links still open: Shared links lists them -->
{#snippet otherLinks()}
  {#if others > 0}
    <p class="ws-sheet-note">
      {$t('memory_share_others', { values: { count: others } })}
      <a class="ws-memory-share-link" href={Route.sharedLinks()}>{$t('shared_links')}</a>
    </p>
  {/if}
{/snippet}

<Modal title={$t('memory_share')} icon={mdiShareVariant} size="small" {onClose}>
  <ModalBody class="p-0">
    <div class="ws-sheet ws-memory-share" data-testid="memory-share">
      <!-- the postcard: the memory, and in one sentence what is true of its link -->
      <section class="ws-sheet-section">
        <p class="ws-sheet-title">{presentation.title}</p>
        {#if view === 'choose'}
          <p class="ws-memory-share-scope" aria-live="polite" data-testid="memory-share-scope">{planned}</p>
        {:else if view === 'shared'}
          <p class="ws-memory-share-scope" role="status" data-testid="memory-share-scope">
            <strong>{$t(found ? 'memory_share_live' : 'memory_share_ready')}</strong>
            {receipt}
          </p>
        {:else if view === 'off'}
          <p class="ws-memory-share-scope" role="status" data-testid="memory-share-scope">
            <strong>{$t('memory_share_off')}</strong>
            {$t('memory_share_off_detail')}
          </p>
        {/if}
      </section>

      {#if view === 'choose'}
        <section class="ws-sheet-section ws-memory-share-formats">
          <fieldset class="ws-memory-share-choices" disabled={!!busy || !!link}>
            <legend class="sr-only">{$t('memory_share_format')}</legend>
            {#each choices as choice (choice.value)}
              <label class="ws-memory-share-choice" class:chosen={mode === choice.value}>
                <input type="radio" name="memory-share-format" value={choice.value} bind:group={mode} />
                <Icon icon={choice.icon} size="24" aria-hidden />
                <span><strong>{$t(choice.title)}</strong><small>{$t(choice.detail)}</small></span>
              </label>
            {/each}
          </fieldset>
        </section>

        <section class="ws-sheet-section">
          <fieldset class="ws-memory-share-expiry" disabled={!!busy || !!link}>
            <p class="ws-sheet-title">{$t('memory_share_expiry')}</p>
            <div class="ws-memory-share-segments">
              <GroupTab
                label={$t('memory_share_expiry')}
                filters={MEMORY_LINK_DAYS.map((choice) => expiryValue(choice))}
                labels={expiryLabels}
                selected={expiryValue(days)}
                onSelect={(value) => (days = MEMORY_LINK_DAYS.find((choice) => expiryValue(choice) === value) ?? null)}
              />
            </div>
          </fieldset>
        </section>

        <section class="ws-sheet-section">
          <div class="ws-sheet-head">
            <label class="ws-sheet-title" for="input-memory-share-password-switch">
              {$t('memory_share_password_add')}
            </label>
            <Switch
              id="memory-share-password-switch"
              checked={protect}
              disabled={!!busy || !!link}
              onCheckedChange={setProtect}
            />
          </div>
          {#if protect}
            <div bind:this={passwordBox}>
              <Field label={$t('password')} disabled={!!busy || !!link} invalid={passwordMissing}>
                <PasswordInput
                  bind:value={password}
                  autocomplete="new-password"
                  aria-invalid={passwordMissing || undefined}
                  aria-describedby={passwordMissing ? 'memory-share-password-missing' : undefined}
                  oninput={() => (passwordMissing = false)}
                />
              </Field>
            </div>
            {#if passwordMissing}
              <p class="ws-memory-share-error" id="memory-share-password-missing" role="alert">
                {$t('memory_share_password_missing')}
              </p>
            {/if}
          {/if}
        </section>

        {#if busy === 'video' || busy === 'link' || tooLong || mode !== 'memory'}
          <section class="ws-sheet-section ws-memory-share-status">
            {#if busy === 'video' || busy === 'link'}
              <div class="ws-memory-share-progress" role="status" aria-live="polite">
                <p>
                  {$t(busy === 'video' ? 'memory_share_making_video' : 'memory_share_making_link')}
                  {#if busy === 'video' && percent}<span class="ws-memory-share-percent">{percent}</span>{/if}
                </p>
                {#if busy === 'video'}<progress max="1" value={progress?.progress}></progress>{/if}
              </div>
            {:else if tooLong}
              <p class="ws-sheet-note" role="status">{$t('memory_film_too_long')}</p>
            {:else}
              <p class="ws-sheet-note">{$t('memory_share_download_note')}</p>
            {/if}
          </section>
        {/if}
      {:else if view === 'shared' && link}
        <section class="ws-sheet-section">
          <ShareLinkPanel sharedLink={link} onTurnOff={turnOff} turningOff={busy === 'off'} />
          <a class="ws-memory-share-open" href={asUrl(link)} target="_blank" rel="noopener noreferrer">
            {$t('memory_share_open')}
            <Icon icon={mdiOpenInNew} size="16" aria-hidden />
          </a>
          {@render otherLinks()}
        </section>
      {:else if view === 'off' && others > 0}
        <section class="ws-sheet-section">{@render otherLinks()}</section>
      {/if}

      {#if failure}
        <section class="ws-sheet-section">
          <div class="ws-memory-share-failure" role="alert">
            <p class="ws-memory-share-error">{failed(failure.step)}</p>
            {#if failure.reason}<p class="ws-sheet-note">{failure.reason}</p>{/if}
          </div>
        </section>
      {/if}
    </div>
  </ModalBody>
  {#if view !== 'looking'}
    <ModalFooter>
      <div class="ws-memory-share-actions">
        {#if view === 'choose' && link}
          <!-- Gallery made the link, Curator could not set its film up: try that again, or take the link back -->
          <button type="button" class="ws-sheet-quiet" disabled={!!busy} onclick={turnOff}>
            {$t('share_link_turn_off')}
          </button>
          <button type="button" class="ws-sheet-primary" disabled={!!busy} onclick={makeLink}>
            {$t('memory_share_try_again')}
          </button>
        {:else if view === 'choose'}
          {#if mode !== 'memory'}
            <button type="button" class="ws-sheet-quiet" disabled={!!busy || tooLong} onclick={download}>
              {$t('memory_share_download')}
            </button>
          {/if}
          <button type="button" class="ws-sheet-primary" disabled={!!busy || tooLong} onclick={makeLink}>
            {$t('share_make_link')}
          </button>
        {:else if view === 'shared'}
          <button type="button" class="ws-sheet-quiet" disabled={!!busy} onclick={startOver}>
            {$t('memory_share_another')}
          </button>
          {#if canShare}
            <button type="button" class="ws-sheet-quiet" onclick={send}>
              <Icon icon={mdiShareVariant} size="18" aria-hidden />
              {$t('share')}
            </button>
          {/if}
        {:else if view === 'off'}
          <button type="button" class="ws-sheet-primary" onclick={startOver}>{$t('share_make_link')}</button>
        {/if}
      </div>
    </ModalFooter>
  {/if}
</Modal>

<style>
  /* the sentence that says what the link shares: the sheet's one fact, in ink at body size; a receipt leads with its
     state in 600 */
  .ws-memory-share-scope {
    max-width: 60ch;
    font-size: var(--ws-text-body);
    line-height: 1.5;
    text-wrap: pretty;
  }
  .ws-memory-share-scope strong {
    font-weight: 650;
  }
  /* the three formats, split by hairlines that run edge to edge like the sections', the one chosen tinted the same */
  .ws-memory-share-formats {
    padding: 0;
  }
  .ws-memory-share-choice {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.85rem 1.25rem;
    cursor: pointer;
    min-height: 4.5rem;
  }
  .ws-memory-share-choice + .ws-memory-share-choice {
    border-top: 1px solid var(--ws-hairline);
  }
  .ws-memory-share-choice input {
    flex: none;
    accent-color: currentColor;
    width: 1rem;
    height: 1rem;
  }
  .ws-memory-share-choice :global(svg) {
    flex: none;
  }
  .ws-memory-share-choice strong,
  .ws-memory-share-choice small {
    display: block;
  }
  .ws-memory-share-choice strong {
    font-weight: 600;
  }
  .ws-memory-share-choice small {
    color: var(--immich-ui-muted);
    font-size: var(--ws-text-meta);
    line-height: 1.45;
    margin-top: 0.125rem;
  }
  .ws-memory-share-choice.chosen {
    background: color-mix(in oklab, var(--immich-ui-dark) 6%, transparent);
  }
  /* muted ink on the tint measured 4.2:1: the chosen row's line is ink, which also says it is the one on */
  .ws-memory-share-choice.chosen small {
    color: var(--immich-ui-dark);
  }
  /* the accent for the keyboard's focus only, not after a click */
  .ws-memory-share-choice:has(input:focus-visible) {
    outline: var(--ws-border) solid var(--ws-accent);
    outline-offset: calc(-1 * var(--ws-border));
  }
  /* how long the link stays open: the layer's segmented control (elements/GroupTab), the width of the sheet, its
     choices sharing it evenly */
  .ws-memory-share-expiry {
    display: grid;
    gap: 0.5rem;
  }
  .ws-memory-share-segments {
    height: 2.75rem;
  }
  /* a finger's choices at the sheet's touch floor: 44px inside the control's frame */
  @media (max-width: 639px), (pointer: coarse) {
    .ws-memory-share-segments {
      height: 3.25rem;
    }
  }
  .ws-memory-share-segments :global(.ws-group-tab) {
    display: grid;
    grid-auto-columns: minmax(0, 1fr);
    grid-auto-flow: column;
    width: 100%;
  }
  .ws-memory-share-segments :global(.ws-group-tab label) {
    justify-content: center;
    padding-inline: 0.25rem;
    text-align: center;
  }
  fieldset:disabled {
    opacity: 0.65;
  }
  .ws-memory-share-progress p {
    font-size: var(--ws-text-ui);
    font-weight: 500;
  }
  .ws-memory-share-percent {
    margin-inline-start: 0.4rem;
    font-family: var(--ws-font-data);
    font-size: var(--ws-text-data);
    font-variant-numeric: tabular-nums;
  }
  .ws-memory-share-progress progress {
    width: 100%;
    height: 0.25rem;
    margin-top: 0.5rem;
    accent-color: currentColor;
  }
  .ws-memory-share-failure {
    display: grid;
    gap: 0.25rem;
  }
  .ws-memory-share-error {
    max-width: 60ch;
    color: var(--ws-danger);
    font-size: var(--ws-text-ui);
    font-weight: 500;
    line-height: 1.45;
  }
  /* the public page, opened as a recipient would: a quiet link under the panel */
  .ws-memory-share-open,
  .ws-memory-share-link {
    color: var(--immich-ui-dark);
    font-weight: 500;
    text-decoration: underline;
    text-underline-offset: 0.25em;
    text-decoration-color: var(--ws-hairline);
  }
  .ws-memory-share-open {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    justify-self: start;
    min-height: 2.75rem;
    font-size: var(--ws-text-ui);
  }
  :is(.ws-memory-share-open, .ws-memory-share-link):hover {
    text-decoration-color: var(--ws-accent);
  }
  :is(.ws-memory-share-open, .ws-memory-share-link):focus-visible {
    outline: var(--ws-border) solid var(--ws-accent);
    outline-offset: 2px;
  }
  /* the sheet's one action at the end, in ink, a quiet one before it; a phone's take the width between them */
  .ws-memory-share-actions {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 0.5rem;
    width: 100%;
  }
  @media (max-width: 639px) {
    .ws-memory-share-actions > :global(button) {
      flex: 1 1 0;
      min-height: 2.75rem;
    }
  }
</style>
