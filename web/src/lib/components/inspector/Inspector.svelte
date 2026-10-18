<script lang="ts">
  // Local Omarchy layer: the inspector window (routes/inspector), made for the owner's portrait Dell beside the AORUS
  // that holds the grid: the photo a main window points at (managers/inspector-link), large and whole at the top, and
  // under it when and where it was taken, who is in it, the albums it is in (each opens in the main window), its
  // description and Curator's story, and the camera and file. Read-only. A new photo replaces the one on screen only
  // once its details are in and its preview is decoded (or after a short wait, over its thumbhash), so a pointer moving
  // on never leaves a blank or half-changed window; pointing at nothing leaves the last photo where it is. In a window
  // wider than tall the details go beside the photo.
  import Thumbhash from '$lib/components/Thumbhash.svelte';
  import { authManager } from '$lib/managers/auth-manager.svelte';
  import { featureFlagsManager } from '$lib/managers/feature-flags-manager.svelte';
  import { InspectorFollower, type InspectorSubject } from '$lib/managers/inspector-link.svelte';
  import { Route } from '$lib/route';
  import { locale } from '$lib/stores/preferences.store';
  import { getAssetMediaUrl, getAssetPlaybackUrl } from '$lib/utils';
  import { curatorIsMine } from '$lib/utils/curator';
  import { getGlobalPersonHref } from '$lib/utils/global-person-route';
  import { lazyComponent } from '$lib/utils/lazy-component.svelte';
  import { getRepresentativeThumbnailUrl } from '$lib/utils/person-avatar';
  import { getAltText } from '$lib/utils/thumbnail-util';
  import { toTimelineAsset } from '$lib/utils/timeline-util';
  import { AssetMediaSize, AssetTypeEnum, type AlbumResponseDto, type PersonResponseDto } from '@immich/sdk';
  import { Icon } from '@immich/ui';
  import { mdiImageBrokenVariant, mdiMapMarkerOutline, mdiPlay } from '@mdi/js';
  import { onMount, untrack } from 'svelte';
  import { t } from 'svelte-i18n';
  import {
    albumYearsOf,
    cameraOf,
    descriptionOf,
    exposureOf,
    fileFactsOf,
    InspectorDetailsLoader,
    InspectorStories,
    peopleOf,
    placeOf,
    previewUrlOf,
    takenOf,
    type InspectorDetails,
  } from './inspector-details';

  interface Props {
    /** a photo to show before any main window says anything (?asset=, for a look at one photo) */
    assetId?: string;
    /** the main window that opened this one (?from=), the one to bring forward when it goes to an album */
    openerSource?: string;
  }

  let { assetId, openerSource }: Props = $props();

  /** after its details are in, a photo waits at most this long for its preview before it shows over its thumbhash */
  const PREVIEW_WAIT_MS = 400;

  const follower = new InspectorFollower();
  const loader = new InspectorDetailsLoader();
  const stories = new InspectorStories();

  // a main window closes the inspector (Shift+I again): a window opened by a script may close itself
  const follow = () => follower.start({ onClose: () => window.close() });
  onMount(() => {
    follow();
    return () => follower.stop();
  });

  const pick = $derived(follower.latest?.pick);
  const subject = $derived<InspectorSubject | undefined>(
    pick?.subject ?? (assetId ? { id: assetId, thumbhash: null, ratio: null, video: false } : undefined),
  );

  type Shown = { details: InspectorDetails; url: string };
  // replaced whole, never changed in place
  let shown = $state.raw<Shown>();
  /** the preview that has loaded in the photo's place (a new photo shows its thumbhash until then) */
  let loadedUrl = $state('');
  /** a preview Gallery could not give */
  let failedUrl = $state('');
  let playing = $state(false);
  /** the photo on screen or on its way */
  let wantedId: string | undefined;
  let generation = 0;

  const preload = (url: string) => {
    const image = new Image();
    image.src = url;
    return {
      url,
      decoded: (image.decode?.() ?? Promise.reject(new Error('no decode'))).then(() => true).catch(() => false),
      cancel: () => {
        image.src = '';
      },
    };
  };

  const show = async (next: InspectorSubject, mine: number) => {
    // the preview starts with the details when the main window gave its cache key
    let image = next.thumbhash ? preload(previewUrlOf(next.id, next.thumbhash)) : undefined;
    try {
      const details = await loader.load(next.id);
      if (!details || mine !== generation) {
        image?.cancel();
        return;
      }
      const url = previewUrlOf(details.asset.id, details.asset.thumbhash);
      if (image?.url !== url) {
        image?.cancel();
        image = preload(url);
      }
      const decoded = await Promise.race([
        image.decoded,
        new Promise<false>((resolve) => setTimeout(() => resolve(false), PREVIEW_WAIT_MS)),
      ]);
      if (mine !== generation) {
        image.cancel();
        return;
      }
      playing = false;
      if (decoded) {
        loadedUrl = url;
      }
      shown = { details, url };
    } catch (error) {
      image?.cancel();
      if (mine === generation) {
        // the photo on screen stays; asking for this one again is allowed
        wantedId = shown?.details.asset.id;
        console.warn('[inspector] could not load the photo', error);
      }
    }
  };

  $effect(() => {
    const next = subject;
    if (!next) {
      return;
    }
    untrack(() => {
      if (next.id === wantedId) {
        return;
      }
      wantedId = next.id;
      const mine = ++generation;
      if (next.id === shown?.details.asset.id) {
        // back to the photo on screen before the other one came: stop asking for that one
        loader.cancel();
        return;
      }
      void show(next, mine);
    });
  });

  const asset = $derived(shown?.details.asset);
  const ratio = $derived(asset?.width && asset.height ? asset.width / asset.height : (subject?.ratio ?? 1.5));
  const isVideo = $derived(asset?.type === AssetTypeEnum.Video);
  // the selection's count belongs to its photo: while another one loads it waits
  const count = $derived(pick?.kind === 'selection' && pick.subject.id === asset?.id ? pick.count : 0);
  const isOwner = $derived(!!asset && authManager.authenticated && authManager.user.id === asset.ownerId);

  const taken = $derived(asset ? takenOf(asset, $locale) : undefined);
  const place = $derived(placeOf(asset?.exifInfo));
  const latlng = $derived(
    asset?.exifInfo?.latitude && asset.exifInfo.longitude
      ? { lat: asset.exifInfo.latitude, lng: asset.exifInfo.longitude }
      : undefined,
  );
  const people = $derived(asset ? peopleOf(asset) : { named: [], unnamed: 0 });
  const hasPeople = $derived(people.named.length > 0 || people.unnamed > 0);
  const albums = $derived(shown?.details.albums ?? []);
  const description = $derived(asset ? descriptionOf(asset) : { text: '', byCurator: false });
  const camera = $derived(cameraOf(asset?.exifInfo));
  const lens = $derived(asset?.exifInfo?.lensModel?.trim() ?? '');
  const exposure = $derived(exposureOf(asset?.exifInfo, $locale));
  const fileFacts = $derived(asset ? fileFactsOf(asset, $locale) : []);
  const duration = $derived.by(() => {
    const seconds = Math.round((asset?.duration ?? 0) / 1000);
    return seconds > 0 ? `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}` : '';
  });

  // Curator's story of the trip the photo belongs to, by its albums; Curator acts for its owner only
  let story = $state<{ text: string; model: string }>();
  $effect(() => {
    const details = shown?.details;
    story = undefined;
    if (!details || details.albums.length === 0 || !curatorIsMine()) {
      return;
    }
    const asked = details.asset.id;
    void stories.first(details.albums).then((found) => {
      if (found && shown?.details.asset.id === asked) {
        story = { text: found.story.text, model: found.story.model };
      }
    });
  });

  const faceOf = (person: PersonResponseDto) =>
    asset ? getRepresentativeThumbnailUrl(person, { isOwner, spaceId: asset.resolvedSpaceId }) : undefined;
  const personHref = (person: PersonResponseDto) => {
    const spaceId = asset?.resolvedSpaceId;
    if (spaceId && person.spacePersonId) {
      return Route.viewSpacePerson(spaceId, person.spacePersonId);
    }
    return isOwner ? getGlobalPersonHref(person) : undefined;
  };
  const coverOf = (album: AlbumResponseDto) =>
    album.albumThumbnailAssetId
      ? getAssetMediaUrl({ id: album.albumThumbnailAssetId, size: AssetMediaSize.Thumbnail })
      : undefined;

  /** A page of Gallery's opens in the main window (it goes there); without one listening, in a new tab. A click
   * with a modifier key is left to the browser. */
  const go = async (event: MouseEvent, url: string) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return;
    }
    event.preventDefault();
    if (openerSource && follower.latest?.source === openerSource) {
      // the window that opened this one is the one going there: bring it forward while the click still allows it
      (window.opener as Window | null)?.focus();
    }
    if (!(await follower.navigate(url))) {
      window.open(url, '_blank', 'noopener');
    }
  };

  const mapUrl = $derived(latlng ? Route.map({ ...latlng, zoom: 12.5 }) : undefined);

  // the search palette is the main window's (the root layout binds Ctrl+K and / on every page): here those keys stop
  // before it, so the inspector never turns into a page of its own; Shift+I closes the inspector from here too
  const onKeydown = (event: KeyboardEvent) => {
    const command = event.ctrlKey || event.metaKey;
    if ((command && event.key.toLowerCase() === 'k') || event.key === '/') {
      event.stopPropagation();
    } else if (event.key.toLowerCase() === 'i' && event.shiftKey && !command && !event.altKey) {
      window.close();
    }
  };

  // Mounting the map through `{#await}` can leave the surrounding subtree unreactive (see lazyComponent)
  const LazyMap = lazyComponent(() => import('$lib/components/shared-components/map/Map.svelte'));
</script>

<!-- the window closing says bye; one brought back from the back-forward cache says hello again -->
<svelte:window
  onkeydowncapture={onKeydown}
  onpagehide={() => follower.stop()}
  onpageshow={(event) => {
    if (event.persisted) {
      follow();
    }
  }}
/>

{#snippet personChip(person: PersonResponseDto)}
  {@const face = faceOf(person)}
  {#if face}
    <img class="ins-face" src={face} alt="" draggable="false" />
  {:else}
    <span class="ins-face ins-face-ring" aria-hidden="true">{person.name.trim().charAt(0)}</span>
  {/if}
  <span class="ins-person-name">{person.name}</span>
{/snippet}

<main class="ins" data-empty={asset ? undefined : ''}>
  {#if asset && shown}
    <figure class="ins-stage" style:--ins-ratio={ratio}>
      <div class="ins-frame">
        {#if asset.thumbhash && loadedUrl !== shown.url}
          <Thumbhash base64ThumbHash={asset.thumbhash} class="ins-photo" aria-hidden="true" />
        {/if}
        {#if failedUrl === shown.url && !playing}
          <!-- Gallery has no preview of it (a video whose thumbnail was never made): a video keeps its play button
               alone in the frame -->
          <div class="ins-photo ins-missing">
            {#if !isVideo}
              <Icon icon={mdiImageBrokenVariant} size="2.5rem" />
              <span>{$t('error_loading_image')}</span>
            {/if}
          </div>
        {:else if playing}
          <!-- svelte-ignore a11y_media_has_caption -->
          <video
            class="ins-photo"
            src={getAssetPlaybackUrl({ id: asset.id, cacheKey: asset.thumbhash })}
            poster={shown.url}
            controls
            autoplay
            playsinline
          ></video>
        {:else}
          <!-- a new element for a new photo: changing an image's source keeps the old picture up until the new one
               loads, which would put the last photo over this one's details -->
          {#key shown.url}
            {@const url = shown.url}
            <img
              class="ins-photo"
              src={url}
              alt={$getAltText(toTimelineAsset(asset))}
              draggable="false"
              onload={() => (loadedUrl = url)}
              onerror={() => (failedUrl = url)}
            />
          {/key}
        {/if}
        {#if count > 0}
          <span class="ins-chip">{$t('selected_count', { values: { count } })}</span>
        {/if}
        {#if isVideo && !playing}
          <button type="button" class="ins-play" onclick={() => (playing = true)} aria-label={$t('play')}>
            <Icon icon={mdiPlay} size="1.75rem" />
            {#if duration}<span>{duration}</span>{/if}
          </button>
        {/if}
      </div>
    </figure>

    <div class="ins-details">
      <header class="ins-when">
        <div class="ins-when-text">
          {#if taken}
            <h1 class="ins-date">
              {#each taken.day as part, index (index)}<span class={{ 'ins-year': part.type === 'year' }}
                  >{part.value}</span
                >{/each}
            </h1>
            <p class="ins-time">{taken.time}</p>
          {/if}
          {#if place}
            <p class="ins-place">
              <Icon icon={mdiMapMarkerOutline} size="1.125rem" class="ins-place-icon" />
              <span>{place}</span>
            </p>
          {/if}
          {#if mapUrl}
            <a class="ins-link" href={mapUrl} onclick={(event) => void go(event, mapUrl)}>{$t('view_in_map')}</a>
          {/if}
        </div>
        {#if latlng && featureFlagsManager.value.map}
          <div class="ins-map">
            {#if LazyMap.current}
              {@const Map = LazyMap.current}
              <Map
                mapMarkers={[
                  {
                    lat: latlng.lat,
                    lon: latlng.lng,
                    id: asset.id,
                    city: asset.exifInfo?.city ?? null,
                    state: asset.exifInfo?.state ?? null,
                    country: asset.exifInfo?.country ?? null,
                  },
                ]}
                center={latlng}
                zoom={12.5}
                simplified
                useLocationPin
                showSettings={false}
                showSimpleControls={false}
              />
            {/if}
          </div>
        {/if}
      </header>

      <div class="ins-columns">
        {#if hasPeople || albums.length > 0 || description.text || story}
          <div class="ins-column">
            {@render belongs()}
          </div>
        {/if}

        <div class="ins-column">
          <section class="ins-section">
            <h2 class="ins-label">{$t('details')}</h2>
            <ul class="ins-facts">
              {#if camera}<li class="ins-fact-name">{camera}</li>{/if}
              {#if lens}<li class="ins-fact-name">{lens}</li>{/if}
              {#if exposure.length > 0}<li class="ins-data">{exposure.join(' · ')}</li>{/if}
              <li class="ins-data ins-file">{asset.originalFileName}</li>
              {#if fileFacts.length > 0}<li class="ins-data">{fileFacts.join(' · ')}</li>{/if}
            </ul>
          </section>
        </div>
      </div>
    </div>
  {:else}
    <p class="ins-empty">{$t('inspector_point_at_photo')}</p>
  {/if}
</main>

<!-- who is in the photo, what it belongs to and what is said of it -->
{#snippet belongs()}
  {#if hasPeople}
    <section class="ins-section">
      <h2 class="ins-label">{$t('people')}</h2>
      <ul class="ins-people">
        {#each people.named as person (person.id)}
          {@const href = personHref(person)}
          <li>
            {#if href}
              <a class="ins-person" {href} onclick={(event) => void go(event, href)}>
                {@render personChip(person)}
              </a>
            {:else}
              <span class="ins-person">{@render personChip(person)}</span>
            {/if}
          </li>
        {/each}
        {#if people.unnamed > 0}
          <li class="ins-unnamed">{$t('inspector_unnamed', { values: { count: people.unnamed } })}</li>
        {/if}
      </ul>
    </section>
  {/if}

  {#if albums.length > 0}
    <section class="ins-section">
      <h2 class="ins-label">{$t('appears_in')}</h2>
      <ul class="ins-albums">
        {#each albums as album (album.id)}
          {@const cover = coverOf(album)}
          {@const href = Route.viewAlbum(album)}
          {@const years = albumYearsOf(album)}
          <li>
            <a class="ins-album" {href} onclick={(event) => void go(event, href)}>
              {#if cover}
                <img class="ins-cover" src={cover} alt="" draggable="false" />
              {:else}
                <span class="ins-cover" aria-hidden="true"></span>
              {/if}
              <span class="ins-album-name">{album.albumName}</span>
              <span class="ins-album-meta">
                {$t('space_album_photo_count', { values: { count: album.assetCount } })}{years ? ` · ${years}` : ''}
              </span>
            </a>
          </li>
        {/each}
      </ul>
    </section>
  {/if}

  {#if description.text}
    <section class="ins-section">
      <h2 class="ins-label">
        {$t('description')}{#if description.byCurator}&nbsp;· {$t('ai_story_by_ai')}{/if}
      </h2>
      <p class="ins-prose">{description.text}</p>
    </section>
  {/if}

  {#if story}
    <section class="ins-section" title={story.model}>
      <h2 class="ins-label">{$t('ai_story')} · {$t('ai_story_by_ai')}</h2>
      <p class="ins-prose">{story.text}</p>
    </section>
  {/if}
{/snippet}

<style>
  .ins {
    --ins-gutter: max(1rem, calc(var(--ws-gap) * 1.6));
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    height: 100dvh;
    overflow: hidden;
    background: var(--immich-ui-light);
    color: var(--immich-ui-dark);
  }
  .ins[data-empty] {
    grid-template-rows: auto;
  }

  /* ---- the photo: whole, as large as the stage allows, a tile's edge. The stage is as tall as the photo at the
     window's width, up to 62% of the window, so the details sit right under a wide photo too ---- */
  .ins-stage {
    container-type: size;
    display: grid;
    place-items: center;
    height: clamp(14rem, calc((100vw - 2 * var(--ins-gutter)) / var(--ins-ratio) + 2 * var(--ins-gutter)), 62dvh);
    min-height: 0;
    margin: 0;
    padding: var(--ins-gutter);
    border-bottom: 1px solid var(--ws-hairline);
  }
  .ins-frame {
    position: relative;
    width: min(100cqw, calc(100cqh * var(--ins-ratio)));
    aspect-ratio: var(--ins-ratio);
    overflow: hidden;
    border-radius: var(--ws-radius);
  }
  .ins-frame::after {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: inherit;
    box-shadow: inset 0 0 0 1px var(--ws-hairline);
    pointer-events: none;
  }
  .ins-frame :global(.ins-photo) {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: contain;
  }
  video.ins-photo {
    background: #000;
  }
  .ins-missing {
    display: grid;
    gap: 0.5rem;
    place-content: center;
    justify-items: center;
    color: var(--immich-ui-muted);
    font-size: var(--ws-text-meta);
  }
  /* on the photo: strong glass, white data type, as a tile's month mark */
  .ins-chip,
  .ins-play {
    border-radius: var(--ws-radius);
    background: var(--ws-glass-strong);
    -webkit-backdrop-filter: var(--ws-glass-blur);
    backdrop-filter: var(--ws-glass-blur);
    color: #fff;
    font-family: var(--ws-font-data);
    font-size: var(--ws-text-data);
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }
  .ins-chip {
    position: absolute;
    top: 0.75rem;
    inset-inline-start: 0.75rem;
    z-index: 2;
    padding: 0.2rem 0.5rem;
    line-height: 1.35;
    pointer-events: none;
  }
  .ins-play {
    position: absolute;
    inset: 0;
    z-index: 2;
    display: inline-flex;
    gap: 0.4rem;
    align-items: center;
    width: max-content;
    height: max-content;
    margin: auto;
    padding: 0.6rem 0.9rem 0.6rem 0.7rem;
    transition: background-color 120ms;
  }
  /* pointed at, the smoke deepens: the thin glass laid over the strong (about 0.79 over 0.64), from the two tokens */
  .ins-play:hover {
    background: linear-gradient(var(--ws-glass), var(--ws-glass)), var(--ws-glass-strong);
  }
  .ins-play:focus-visible {
    outline: var(--ws-border) solid var(--ws-accent);
    outline-offset: 2px;
  }

  /* ---- the details: when and where as the heading, then two columns as the width allows ---- */
  .ins-details {
    container-type: inline-size;
    display: grid;
    gap: 1.25rem;
    align-content: start;
    min-height: 0;
    overflow-y: auto;
    padding: var(--ins-gutter);
    scrollbar-width: thin;
    scrollbar-color: color-mix(in oklab, var(--immich-ui-dark) 22%, transparent) transparent;
  }
  .ins-when {
    display: grid;
    grid-template-columns: minmax(0, 1fr) clamp(14rem, 40cqi, 28rem);
    gap: 1rem 1.5rem;
    align-items: start;
  }
  .ins-when:not(:has(.ins-map)) {
    grid-template-columns: minmax(0, 1fr);
  }
  .ins-when-text {
    display: grid;
    gap: 0.45rem;
    justify-items: start;
    min-width: 0;
  }
  /* the date in the bar heading's voice at the display role: the condensed face, the month 500 and the year 750. The
     role follows the window's width, and a window wider than tall holds the details in a column beside the photo, so
     there the date is never wider than its column lets it be (36px, the role's least) */
  .ins-date {
    font-family: var(--font-display);
    font-size: min(var(--ws-text-display), max(2.25rem, 1rem + 3.4cqi));
    font-stretch: 75%;
    font-variation-settings:
      'wdth' 75,
      'opsz' 96;
    font-weight: 500;
    line-height: 0.92;
    letter-spacing: -0.02em;
    word-spacing: 0.06em;
    text-wrap: balance;
  }
  .ins-year {
    font-weight: 750;
    font-variant-numeric: tabular-nums;
  }
  .ins-time,
  .ins-data,
  .ins-unnamed,
  .ins-album-meta {
    font-family: var(--ws-font-data);
    font-size: var(--ws-text-data);
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }
  .ins-time {
    margin-top: 0.15rem;
  }
  .ins-place {
    display: flex;
    gap: 0.35rem;
    align-items: center;
    margin-top: 0.35rem;
    font-size: var(--ws-text-body);
    font-weight: 500;
  }
  .ins-place :global(.ins-place-icon) {
    flex: none;
    color: var(--immich-ui-muted);
  }
  .ins-map {
    height: 11rem;
    overflow: hidden;
    border-radius: var(--ws-radius);
    box-shadow: inset 0 0 0 1px var(--ws-hairline);
  }
  /* the small map has no controls of its own (Map.svelte keeps its light/dark switch at the top-right): it is a glance,
     and "View in map" opens the main window's map */
  .ins-map :global(.maplibregl-ctrl-top-right) {
    display: none;
  }
  .ins-link {
    font-size: var(--ws-text-ui);
    font-weight: 500;
    text-decoration: underline;
    text-decoration-color: var(--ws-hairline);
    text-underline-offset: 0.25em;
    transition: text-decoration-color 120ms;
  }
  .ins-link:hover {
    text-decoration-color: var(--ws-accent);
  }
  .ins-link:focus-visible,
  .ins-person:focus-visible,
  .ins-album:focus-visible {
    outline: var(--ws-border) solid var(--ws-accent);
    outline-offset: 2px;
  }

  .ins-columns {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 20rem), 1fr));
    gap: 1.75rem 2.5rem;
    padding-top: 1.25rem;
    border-top: 1px solid var(--ws-hairline);
  }
  .ins-column,
  .ins-section {
    display: grid;
    align-content: start;
    min-width: 0;
  }
  .ins-column {
    gap: 1.75rem;
  }
  .ins-section {
    gap: 0.6rem;
  }
  .ins-label {
    font-size: var(--ws-text-meta);
    font-weight: 600;
    color: var(--immich-ui-muted);
  }

  .ins-people {
    display: flex;
    flex-wrap: wrap;
    gap: 0.6rem 1.1rem;
    align-items: center;
  }
  .ins-person {
    display: inline-flex;
    gap: 0.5rem;
    align-items: center;
    border-radius: var(--ws-radius);
    font-size: var(--ws-text-ui);
    font-weight: 500;
  }
  a.ins-person:hover .ins-person-name {
    text-decoration: underline;
    text-decoration-color: var(--ws-accent);
    text-underline-offset: 0.25em;
  }
  /* faces stay round, whatever the theme's corners */
  .ins-face {
    flex: none;
    width: 2.25rem;
    height: 2.25rem;
    border-radius: 50%;
    object-fit: cover;
  }
  .ins-face-ring {
    display: grid;
    place-items: center;
    box-shadow: inset 0 0 0 1px color-mix(in oklab, var(--immich-ui-dark) 38%, transparent);
    font-weight: 600;
  }
  .ins-unnamed {
    color: var(--immich-ui-muted);
  }

  .ins-albums {
    display: grid;
    gap: 0.15rem;
  }
  .ins-album {
    display: grid;
    grid-template-columns: 2.5rem minmax(0, 1fr);
    column-gap: 0.75rem;
    align-items: center;
    margin-inline: -0.5rem;
    padding: 0.35rem 0.5rem;
    border-radius: var(--ws-radius);
    transition: background-color 120ms;
  }
  .ins-album:hover {
    background: color-mix(in oklab, var(--immich-ui-dark) 5%, transparent);
  }
  .ins-cover {
    grid-row: span 2;
    width: 2.5rem;
    height: 2.5rem;
    border-radius: var(--ws-radius);
    background: color-mix(in oklab, var(--immich-ui-dark) 8%, transparent);
    object-fit: cover;
  }
  .ins-album-name {
    overflow: hidden;
    font-size: var(--ws-text-ui);
    font-weight: 500;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .ins-album-meta {
    color: var(--immich-ui-muted);
  }

  .ins-prose {
    max-width: 62ch;
    font-size: var(--ws-text-body);
    line-height: 1.55;
    text-wrap: pretty;
  }

  .ins-facts {
    display: grid;
    gap: 0.3rem;
  }
  .ins-fact-name {
    font-size: var(--ws-text-ui);
    font-weight: 500;
  }
  .ins-file {
    margin-top: 0.35rem;
    overflow-wrap: anywhere;
  }

  .ins-empty {
    margin: clamp(3rem, 12vh, 8rem) var(--ins-gutter) 0;
    font-size: var(--ws-text-body);
    color: var(--immich-ui-muted);
  }

  /* a window wider than tall: the details beside the photo */
  @media (min-aspect-ratio: 5/4) {
    .ins {
      grid-template-rows: minmax(0, 1fr);
      grid-template-columns: minmax(0, 1fr) clamp(22rem, 34vw, 36rem);
    }
    .ins-stage {
      height: auto;
      border-bottom: 0;
      border-inline-end: 1px solid var(--ws-hairline);
    }
  }
  /* a narrow details column: the map under the words */
  @container (max-width: 34rem) {
    .ins-when {
      grid-template-columns: minmax(0, 1fr);
    }
  }
</style>
