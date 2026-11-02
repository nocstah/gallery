<script lang="ts">
  // Local Omarchy layer: Change song, for one day of Coming up (gallery/series). The memory's song first, then Curator's
  // suggestions for it; typing searches the owner's whole music library instead. Each song can be listened to here. Use
  // this song asks Curator, which keeps the song with the memory and answers with it; the sheet closes with it, and the
  // row shows it. Nothing changes on Cancel.
  import { musicUrl } from '$lib/utils/curator';
  import { Button, HStack, Icon, Input, Modal, ModalBody, ModalFooter } from '@immich/ui';
  import { mdiMusicNote, mdiPause, mdiPlay } from '@mdi/js';
  import { onDestroy, onMount, untrack } from 'svelte';
  import { t } from 'svelte-i18n';
  import { seriesApi, seriesFailure, type ComingMemory, type SeriesSong } from './series-api';

  type Props = {
    seriesId: number;
    memory: ComingMemory;
    /** the memory with its new song; nothing when the song stayed */
    onClose: (memory?: ComingMemory) => void;
  };

  const SEARCH_WAIT = 250;

  let { seriesId, memory, onClose }: Props = $props();

  const own = untrack(() => memory.tracks[0]);
  let query = $state('');
  let songs = $state<SeriesSong[]>();
  let chosen = $state<string | undefined>(own?.id);
  let listening = $state<string>();
  let failed = $state<string>();
  let saving = $state(false);
  let audio = $state<HTMLAudioElement>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let asked = 0;

  const searching = $derived(query.trim().length > 0);
  // the memory's own song heads the suggestions; a search shows only what it found
  const shown = $derived(searching ? (songs ?? []) : [...(own ? [{ ...own, used: false }] : []), ...(songs ?? [])]);
  const others = $derived(songs?.length ?? 0);

  const load = async (text: string) => {
    const mine = ++asked;
    try {
      const answer = await seriesApi.songs(seriesId, memory.key, text);
      if (mine === asked) {
        songs = answer.songs;
        failed = undefined;
      }
    } catch (error) {
      if (mine === asked) {
        songs = [];
        failed = seriesFailure(error);
      }
    }
  };

  const typed = () => {
    clearTimeout(timer);
    songs = undefined;
    timer = setTimeout(() => void load(query.trim()), SEARCH_WAIT);
  };

  const listen = async (song: SeriesSong) => {
    if (!audio) {
      return;
    }
    if (listening === song.id) {
      audio.pause();
      listening = undefined;
      return;
    }
    audio.src = musicUrl(song.src);
    listening = song.id;
    try {
      await audio.play();
    } catch {
      if (listening === song.id) {
        listening = undefined;
      }
    }
  };

  const save = async () => {
    if (!chosen || chosen === own?.id || saving) {
      return;
    }
    saving = true;
    failed = undefined;
    try {
      const changed = await seriesApi.song(seriesId, memory.key, chosen);
      onClose(changed.memory);
    } catch (error) {
      failed = seriesFailure(error);
      saving = false;
    }
  };

  const length = (seconds: number) =>
    `${Math.floor(seconds / 60)}:${String(Math.round(seconds % 60) % 60).padStart(2, '0')}`;

  onMount(() => void load(''));
  onDestroy(() => {
    clearTimeout(timer);
    audio?.pause();
  });
</script>

<Modal title={$t('memory_series_song')} icon={mdiMusicNote} onClose={() => onClose()} size="medium">
  <ModalBody>
    <div class="series-song" data-testid="series-song">
      <Input
        type="search"
        aria-label={$t('memory_series_song_search')}
        placeholder={$t('memory_series_song_search')}
        data-testid="series-song-search"
        bind:value={query}
        oninput={typed}
      />

      {#if !searching}
        <h3 class="series-song-step">{$t('memory_series_song_suggested')}</h3>
      {/if}

      {#if shown.length > 0}
        <ul class="series-song-list" data-testid="series-song-list">
          {#each shown as song (song.id)}
            {@const name = song.artist ? `${song.title} · ${song.artist}` : song.title}
            <li class="series-song-row">
              <button
                type="button"
                class="series-song-listen"
                aria-label={$t('memory_series_song_listen', { values: { song: name } })}
                aria-pressed={listening === song.id}
                onclick={() => listen(song)}
              >
                <Icon icon={listening === song.id ? mdiPause : mdiPlay} size="18" aria-hidden />
              </button>
              <button
                type="button"
                class="series-song-pick"
                aria-pressed={chosen === song.id}
                onclick={() => (chosen = song.id)}
              >
                <span class="series-song-name">{name}</span>
                {#if song.used}
                  <span class="series-song-used">{$t('memory_series_song_used')}</span>
                {/if}
                <span class="series-song-length">{length(song.duration)}</span>
              </button>
            </li>
          {/each}
        </ul>
      {/if}

      {#if songs === undefined}
        {#if !failed}
          <p class="series-song-quiet" role="status">{$t('loading')}</p>
        {/if}
      {:else if others === 0 && !failed}
        <p class="series-song-quiet">{$t(searching ? 'memory_series_song_no_match' : 'memory_series_song_none')}</p>
      {/if}

      {#if failed}
        <p class="series-song-failed" role="alert">{failed}</p>
      {/if}

      <audio bind:this={audio} preload="none" onended={() => (listening = undefined)}></audio>
    </div>
  </ModalBody>
  <ModalFooter>
    <HStack fullWidth>
      <Button shape="round" color="secondary" fullWidth onclick={() => onClose()}>{$t('cancel')}</Button>
      <Button
        shape="round"
        fullWidth
        disabled={!chosen || chosen === own?.id || saving}
        onclick={save}
        data-testid="series-song-confirm"
      >
        {$t('memory_series_song_confirm')}
      </Button>
    </HStack>
  </ModalFooter>
</Modal>

<style>
  .series-song {
    display: grid;
    gap: 0.75rem;
  }
  .series-song-step {
    font-size: var(--ws-text-ui);
    font-weight: 600;
  }
  .series-song-list {
    list-style: none;
  }
  .series-song-row {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    align-items: stretch;
  }
  .series-song-row:not(:first-child) {
    border-top: 1px solid var(--ws-hairline);
  }
  .series-song-listen {
    display: grid;
    place-items: center;
    width: 2.5rem;
    color: var(--immich-ui-muted);
  }
  .series-song-listen:hover,
  .series-song-listen[aria-pressed='true'] {
    color: var(--ws-accent);
  }
  .series-song-pick {
    display: flex;
    align-items: baseline;
    gap: 0.75rem;
    min-width: 0;
    padding: 0.6rem 0.5rem;
    border-radius: var(--ws-radius);
    font-size: var(--ws-text-ui);
    text-align: start;
  }
  .series-song-pick:hover {
    box-shadow: inset 0 0 0 var(--ws-border) var(--ws-accent);
  }
  /* the one chosen is inverted round its edge, as a chosen photo is in Swap a photo */
  .series-song-pick[aria-pressed='true'] {
    box-shadow:
      inset 0 0 0 calc(var(--ws-border) + 1px) var(--immich-ui-dark),
      inset 0 0 0 calc(var(--ws-border) + 3px) var(--immich-ui-light);
    font-weight: 600;
  }
  .series-song-listen:focus-visible,
  .series-song-pick:focus-visible {
    outline: var(--ws-border) solid var(--ws-accent);
    outline-offset: 2px;
  }
  .series-song-name {
    flex: 1;
    min-width: 0;
    overflow-wrap: anywhere;
  }
  .series-song-used,
  .series-song-length,
  .series-song-quiet {
    color: var(--immich-ui-muted);
  }
  .series-song-used {
    flex: none;
    font-size: var(--ws-text-data);
  }
  .series-song-length {
    flex: none;
    font-family: var(--ws-font-data);
    font-size: var(--ws-text-data);
    font-variant-numeric: tabular-nums;
  }
  .series-song-quiet {
    font-size: var(--ws-text-ui);
  }
  .series-song-failed {
    font-size: var(--ws-text-ui);
    font-weight: 500;
    color: var(--ws-danger);
  }
</style>
