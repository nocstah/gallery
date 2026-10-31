<script lang="ts">
  // Local Omarchy layer: New series, from the list in From the beginning (gallery/series). What the series is made
  // from: the whole library, or a smart album picked from Curator's list (by name, with how many photos it holds; the
  // names are the owner's alone, as on these pages). An album that has a series already says so, and picking it opens
  // that one: Curator keeps one series an album. Then an optional span of days, from and to. Curator plans the series
  // and the sheet closes with its id for the page to open; what Curator refuses (a span that ends before it starts) is
  // said in its words, and the sheet stays. Nothing is made on Cancel.
  import type { SmartAlbum } from '$lib/utils/curator';
  import { Field, FormModal, Input } from '@immich/ui';
  import { mdiCalendarHeartOutline } from '@mdi/js';
  import { onMount } from 'svelte';
  import { t } from 'svelte-i18n';
  import { seriesApi, seriesFailure, type NewSeries, type SeriesCard } from './series-api';

  type Props = {
    /** the series there are: an album's own is opened, never made twice */
    series: SeriesCard[];
    /** the series to open, the one Curator made or the album's own; nothing on Cancel */
    onClose: (seriesId?: number) => void;
  };

  let { series, onClose }: Props = $props();

  const id = $props.id();

  let from = $state<'library' | 'album'>('library');
  let albumId = $state<number>();
  let spanFrom = $state('');
  let spanTo = $state('');
  /** Curator's smart albums: undefined until it has answered */
  let albums = $state<SmartAlbum[]>();
  let albumsFailed = $state<string>();
  let failed = $state<string>();
  // Curator is asked once at a time, a second Enter while it answers asking nothing more
  let asking = false;

  /** the series an album has already, by the smart album or by its Gallery album */
  const seriesOf = (album: SmartAlbum) =>
    series.find((card) => card.smart_album_id === album.id || (!!card.album_id && card.album_id === album.album_id));

  const picked = $derived(from === 'album' ? albums?.find((album) => album.id === albumId) : undefined);
  const opens = $derived(picked ? seriesOf(picked) : undefined);
  const ready = $derived(from === 'library' || !!picked);

  onMount(async () => {
    try {
      albums = await seriesApi.smartAlbums();
    } catch (error) {
      albumsFailed = seriesFailure(error);
    }
  });

  const onSubmit = async () => {
    if (!ready || asking) {
      return;
    }
    if (opens) {
      onClose(opens.id);
      return;
    }
    asking = true;
    failed = undefined;
    const asked: NewSeries = {
      ...(picked && { smart_album_id: picked.id }),
      ...(spanFrom && { span_from: spanFrom }),
      ...(spanTo && { span_to: spanTo }),
    };
    try {
      const { series: made } = await seriesApi.create(asked);
      onClose(made.id);
    } catch (error) {
      failed = seriesFailure(error);
    } finally {
      asking = false;
    }
  };
</script>

<FormModal
  title={$t('memory_series_new')}
  icon={mdiCalendarHeartOutline}
  size="medium"
  submitText={$t(opens ? 'memory_series_open' : 'memory_series_make')}
  cancelText={$t('cancel')}
  disabled={!ready}
  onClose={() => onClose()}
  {onSubmit}
>
  <div class="series-new" data-testid="series-new-sheet">
    <fieldset class="series-new-group">
      <legend class="series-new-label">{$t('memory_series_new_source')}</legend>
      <div class="ws-seg series-new-from">
        <button type="button" aria-pressed={from === 'library'} onclick={() => (from = 'library')}>
          {$t('memory_series_whole_library')}
        </button>
        <button type="button" aria-pressed={from === 'album'} onclick={() => (from = 'album')}>
          {$t('memory_series_new_album')}
        </button>
      </div>

      {#if from === 'album'}
        {#if albumsFailed}
          <p class="series-new-failed" role="alert">{albumsFailed}</p>
        {:else if !albums}
          <p class="series-new-quiet" role="status">{$t('loading')}</p>
        {:else if albums.length === 0}
          <p class="series-new-quiet" data-testid="series-new-no-albums">{$t('memory_series_no_smart_albums')}</p>
        {:else}
          <ul class="series-new-albums" data-testid="series-new-albums">
            {#each albums as album (album.id)}
              {@const own = seriesOf(album)}
              <li>
                <label class="series-new-album" data-testid="series-new-album" data-series={own?.id}>
                  <input type="radio" name="{id}-album" value={album.id} bind:group={albumId} />
                  <span class="series-new-album-name">{album.name}</span>
                  <span class="ws-inbox-meta">{$t('assets_count', { values: { count: album.count } })}</span>
                  {#if own}
                    <span class="series-new-album-own">{$t('memory_series_has_series')}</span>
                  {/if}
                </label>
              </li>
            {/each}
          </ul>
        {/if}
      {/if}
    </fieldset>

    <!-- an album's own series keeps its span: there is none to give it here -->
    <fieldset class="series-new-group" disabled={!!opens}>
      <legend class="series-new-label">{$t('memory_series_span')}</legend>
      <div class="series-new-span">
        <Field label={$t('memory_series_span_start')} disabled={!!opens}>
          <Input type="date" bind:value={spanFrom} max={spanTo || undefined} />
        </Field>
        <Field label={$t('memory_series_span_end')} disabled={!!opens}>
          <Input type="date" bind:value={spanTo} min={spanFrom || undefined} />
        </Field>
      </div>
      <p class="series-new-quiet">{$t('memory_series_span_hint')}</p>
    </fieldset>

    {#if failed}
      <p class="series-new-failed" role="alert">{failed}</p>
    {/if}
  </div>
</FormModal>

<style>
  .series-new {
    display: grid;
    gap: 1.5rem;
    margin-block: 0.5rem;
  }
  .series-new-group {
    display: grid;
    gap: 0.6rem;
    min-width: 0;
  }
  .series-new-label {
    margin-bottom: 0.6rem;
    font-size: var(--ws-text-ui);
    font-weight: 600;
  }
  .series-new-from {
    width: fit-content;
    margin-inline-start: 0;
    flex-wrap: wrap;
  }
  /* the smart albums as rows split by hairlines edge to edge, the list scrolling on its own when it is long */
  .series-new-albums {
    max-height: 16rem;
    overflow-y: auto;
    list-style: none;
    border-block: 1px solid var(--ws-hairline);
  }
  .series-new-albums > li + li {
    border-top: 1px solid var(--ws-hairline);
  }
  .series-new-album {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: baseline;
    gap: 0.15rem 0.75rem;
    padding: 0.6rem 0.25rem;
    font-size: var(--ws-text-ui);
    cursor: pointer;
  }
  .series-new-album input {
    accent-color: var(--immich-ui-dark);
  }
  .series-new-album input:focus-visible {
    outline: var(--ws-border) solid var(--ws-accent);
    outline-offset: 2px;
  }
  .series-new-album-name {
    font-weight: 500;
    overflow-wrap: anywhere;
  }
  .series-new-album-own {
    grid-column: 2 / -1;
    font-size: var(--ws-text-meta);
    color: var(--immich-ui-muted);
  }
  .series-new-span {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 12rem));
    gap: 0.75rem;
  }
  .series-new-group:disabled {
    opacity: 0.45;
  }
  .series-new-quiet {
    font-size: var(--ws-text-ui);
    color: var(--immich-ui-muted);
  }
  .series-new-failed {
    font-size: var(--ws-text-ui);
    font-weight: 500;
    color: var(--ws-danger);
  }
  @media (max-width: 480px) {
    .series-new-span {
      grid-template-columns: minmax(0, 1fr);
    }
  }
</style>
