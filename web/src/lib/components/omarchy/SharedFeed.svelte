<script lang="ts">
  // Local Omarchy layer: the Shared page's feed (DESIGN.md, Shared), drawn like a Space's Activity: a day is a muted
  // label over a hairline that stays at the top while its items pass; an item is a row split from the next by a
  // hairline: who (the avatar, and the name or You in the sentence), where (the Space or album, a link), what happened,
  // when (data type, at the row's end), and the photos it is about as a strip of the grid's own square tiles, each
  // opening in the viewer, then +N for the rest where they live. Comments show their text; hearts come together.
  import UserAvatar from '$lib/components/shared-components/UserAvatar.svelte';
  import { Route } from '$lib/route';
  import { getAssetMediaUrl } from '$lib/utils';
  import {
    fullTime,
    groupByDay,
    relativeTime,
    type FeedComment,
    type FeedItem,
    type FeedPerson,
    type FeedPlace,
  } from '$lib/utils/shared-feed';
  import { formatGroupTitle } from '$lib/utils/timeline-util';
  import { AssetMediaSize, SharedLinkType } from '@immich/sdk';
  import { Icon } from '@immich/ui';
  import { mdiImageAlbum } from '@mdi/js';
  import { DateTime } from 'luxon';
  import { SvelteSet } from 'svelte/reactivity';
  import { locale, t } from 'svelte-i18n';

  type Props = {
    items: FeedItem[];
    /** my id: what I did reads "You" */
    meId: string;
    canShowMore: boolean;
    onShowMore: () => void;
    /** where a photo opens in the viewer */
    photoHref: (assetId: string) => string;
    /** a photo of this item is opening: the viewer steps through the item's photos */
    onOpenPhoto?: (item: FeedItem, assetId: string) => void;
  };

  let { items, meId, canShowMore, onShowMore, photoHref, onOpenPhoto }: Props = $props();

  /** tiles in a strip: six on a wide screen, four on a phone, then +N */
  const WIDE = 6;
  const NARROW = 4;
  /** comments an item shows (the latest), then how many more */
  const COMMENTS = 3;

  // the times are read against a clock that moves each minute, so "now" becomes "1m ago" while the page is open
  let now = $state(Date.now());
  $effect(() => {
    const timer = setInterval(() => (now = Date.now()), 60_000);
    return () => clearInterval(timer);
  });

  // a photo gone since the item was written (its thumbnail no longer loads) leaves the strip
  const missing = new SvelteSet<string>();

  const days = $derived(groupByDay(items));
  const lang = $derived($locale ?? undefined);

  const dayLabel = (iso: string) => {
    const label = formatGroupTitle(DateTime.fromISO(iso));
    return label.charAt(0).toUpperCase() + label.slice(1);
  };

  const isMe = (person: FeedPerson | null) => !!person && person.id === meId;
  const nameOf = (person: FeedPerson | null) =>
    isMe(person) ? $t('you') : person?.name || $t('spaces_activity_someone');
  const who = (person: FeedPerson | null) => ({ who: isMe(person) ? 'you' : 'other', name: nameOf(person) });

  /** several people: me first, as "You", then the others by name ("You and Mom") */
  const names = (people: FeedPerson[]) => {
    const words = [...people].sort((a, b) => Number(isMe(b)) - Number(isMe(a))).map((person) => nameOf(person));
    try {
      return new Intl.ListFormat(lang, { type: 'conjunction' }).format(words);
    } catch {
      return words.join(', ');
    }
  };

  const what = (item: FeedItem): string => {
    switch (item.kind) {
      case 'added': {
        return $t('shared_feed_added', { values: { ...who(item.person), count: item.count } });
      }
      case 'removed': {
        return $t('shared_feed_removed', { values: { ...who(item.person), count: item.count } });
      }
      case 'album-added': {
        return $t('shared_feed_album_added', { values: who(item.person) });
      }
      case 'album-removed': {
        return $t('shared_feed_album_removed', { values: who(item.person) });
      }
      case 'joined': {
        return $t('shared_feed_joined', { values: who(item.person) });
      }
      case 'left': {
        return $t('shared_feed_left', { values: who(item.person) });
      }
      case 'comments': {
        return item.people.length > 1
          ? $t('shared_feed_comments', { values: { count: item.comments.length } })
          : $t('shared_feed_commented', { values: { ...who(item.person), count: item.comments.length } });
      }
      case 'hearts': {
        return item.people.length > 1
          ? $t('shared_feed_hearts', { values: { hearts: item.hearts, photos: item.photoIds.length } })
          : $t('shared_feed_hearted', { values: { ...who(item.person), photos: item.photoIds.length } });
      }
      case 'link': {
        return $t('shared_feed_link', {
          values: { kind: item.linkType === SharedLinkType.Album ? 'album' : 'photos', count: item.count },
        });
      }
    }
  };

  const placeHref = (place: FeedPlace) => {
    switch (place.kind) {
      case 'space': {
        return Route.viewSpace({ id: place.id });
      }
      case 'album': {
        return Route.viewAlbum({ id: place.id });
      }
      case 'links': {
        return Route.sharedLinks();
      }
    }
  };
  const placeName = (place: FeedPlace) => (place.kind === 'links' ? place.name || $t('shared_links') : place.name);

  /** what the strip stands for: an add counts what it added (a Space writes down only its first few photos) */
  const total = (item: FeedItem) =>
    item.kind === 'added' ? Math.max(item.count, item.photoIds.length) : item.photoIds.length;

  const expiry = (iso: string) => {
    const date = new Date(iso);
    if (date.getTime() <= now) {
      return $t('expired');
    }
    const sameYear = date.getFullYear() === new Date(now).getFullYear();
    const day = date.toLocaleDateString(lang, {
      month: 'short',
      day: 'numeric',
      year: sameYear ? undefined : 'numeric',
    });
    return $t('expires_date', { values: { date: day } });
  };

  const quiet = (item: FeedItem) => ['removed', 'album-removed', 'left'].includes(item.kind);
</script>

{#snippet tile(item: FeedItem, id: string, extra = '')}
  <a
    href={photoHref(id)}
    class="ws-feed-tile {extra}"
    data-thumbnail-focus-container
    data-asset={id}
    aria-label={$t('view')}
    draggable="false"
    onclick={() => onOpenPhoto?.(item, id)}
  >
    <img
      src={getAssetMediaUrl({ id, size: AssetMediaSize.Thumbnail })}
      alt=""
      loading="lazy"
      draggable="false"
      onerror={() => missing.add(id)}
    />
  </a>
{/snippet}

{#snippet strip(item: FeedItem)}
  {@const photos = item.photoIds.filter((id) => !missing.has(id))}
  {@const shown = photos.slice(0, WIDE)}
  {@const wideMore = total(item) - shown.length}
  {@const narrowMore = total(item) - Math.min(NARROW, shown.length)}
  {#if shown.length > 0}
    <div class="ws-feed-strip">
      {#each shown as id, index (id)}
        {@render tile(item, id, index >= NARROW ? 'ws-feed-wide' : '')}
      {/each}
      {#if wideMore > 0}
        <a
          class="ws-feed-more ws-feed-more-wide"
          href={placeHref(item.place)}
          aria-label={$t('shared_feed_more_photos', { values: { count: wideMore } })}>+{wideMore}</a
        >
      {/if}
      {#if narrowMore > 0}
        <a
          class="ws-feed-more ws-feed-more-narrow"
          href={placeHref(item.place)}
          aria-label={$t('shared_feed_more_photos', { values: { count: narrowMore } })}>+{narrowMore}</a
        >
      {/if}
    </div>
  {/if}
{/snippet}

{#snippet comments(item: FeedItem, list: FeedComment[], several: boolean)}
  {@const latest = list.slice(-COMMENTS)}
  <ul class="ws-feed-comments">
    {#each latest as comment (comment.id)}
      <li class="ws-feed-comment">
        {#if comment.assetId && !missing.has(comment.assetId)}
          {@render tile(item, comment.assetId)}
        {/if}
        <p class="ws-feed-comment-text">
          {#if several}<span class="ws-feed-comment-who">{nameOf(comment.person)}</span>{/if}
          {$t('shared_feed_quote', { values: { text: comment.text } })}
        </p>
      </li>
    {/each}
  </ul>
  {#if list.length > COMMENTS}
    <a class="ws-feed-link" href={placeHref(item.place)}>
      {$t('shared_feed_more_comments', { values: { count: list.length - COMMENTS } })}
    </a>
  {/if}
{/snippet}

<div class="ws-feed" data-testid="shared-feed">
  {#each days as day (day.key)}
    <section class="ws-feed-day" aria-labelledby="feed-day-{day.key}">
      <h2 class="ws-feed-day-label" id="feed-day-{day.key}">{dayLabel(day.at)}</h2>
      <ol class="ws-feed-items">
        {#each day.items as item (item.key)}
          <li class="ws-feed-item" class:ws-feed-quiet={quiet(item)} data-kind={item.kind} data-testid="feed-item">
            <span class="ws-feed-avatar" class:ws-feed-avatar-none={!item.person} aria-hidden="true">
              {#if item.person}
                <UserAvatar user={item.person} size="sm" noTitle />
              {/if}
            </span>
            <div class="ws-feed-body">
              <p class="ws-feed-head">
                <a class="ws-feed-place" href={placeHref(item.place)}>{placeName(item.place)}</a>
                <span class="ws-feed-sep" aria-hidden="true">·</span>
                <span class="ws-feed-what">{what(item)}</span>
              </p>
              {#if item.kind === 'hearts' && item.people.length > 1}
                <!-- several people's hearts: who, as a list, under what they came to -->
                <p class="ws-feed-people">{names(item.people)}</p>
              {/if}
              {#if item.kind === 'album-added'}
                <a
                  class="ws-feed-album"
                  href={Route.viewSpaceAlbum({ spaceId: item.place.id, albumId: item.album.id })}
                >
                  <Icon icon={mdiImageAlbum} size="1.1em" aria-hidden={true} />
                  <span>{item.album.name}</span>
                </a>
              {:else if item.kind === 'album-removed'}
                <span class="ws-feed-album">
                  <Icon icon={mdiImageAlbum} size="1.1em" aria-hidden={true} />
                  <span>{item.album.name}</span>
                </span>
              {:else if item.kind === 'link' && item.expiresAt}
                <p class="ws-feed-meta">{expiry(item.expiresAt)}</p>
              {/if}
              {#if item.kind === 'comments'}
                {@render comments(item, item.comments, item.people.length > 1)}
              {:else}
                {@render strip(item)}
              {/if}
            </div>
            <time class="ws-feed-when" datetime={item.at} title={fullTime(item.at, lang)}>
              {relativeTime(item.at, now, lang)}
            </time>
          </li>
        {/each}
      </ol>
    </section>
  {/each}

  {#if canShowMore}
    <div class="ws-feed-more-row">
      <button type="button" class="ws-btn-quiet" onclick={onShowMore} data-testid="feed-show-more">
        {$t('show_more')}
      </button>
    </div>
  {/if}
</div>

<style>
  /* one column on the page's gutter, at Settings' measure, the day labels and rows on the same line as the bar's title */
  .ws-feed {
    max-width: 60rem;
    padding: 0 0 4rem;
    color: var(--immich-ui-dark);
  }
  /* a day: a muted label in the meta role over a hairline; it stays at the top while its items pass, reaching up over
     the content panel's 0.5rem gutter so no row shows through above it */
  .ws-feed-day-label {
    position: sticky;
    top: -0.5rem;
    z-index: 3;
    margin: 0;
    padding: 1.5rem 0 0.45rem;
    border-bottom: 1px solid var(--ws-hairline);
    background: var(--immich-ui-light);
    color: var(--immich-ui-muted);
    font-size: var(--ws-text-meta);
    font-weight: 600;
  }
  .ws-feed-day:first-child .ws-feed-day-label {
    padding-top: calc(var(--ws-gap) * 0.6);
  }
  .ws-feed-items {
    margin: 0;
    padding: 0;
    list-style: none;
  }
  /* an item: the avatar, what happened (and its photos), when */
  .ws-feed-item {
    display: grid;
    grid-template-columns: 1.75rem minmax(0, 1fr) auto;
    column-gap: 0.85rem;
    align-items: start;
    padding: 0.95rem 0;
  }
  .ws-feed-item + .ws-feed-item {
    border-top: 1px solid var(--ws-hairline);
  }
  /* the person as a quiet ring with the initial in ink, as the bar's account (a picture still fills it) */
  .ws-feed-avatar {
    display: block;
    width: 1.75rem;
    height: 1.75rem;
    border-radius: 999px;
  }
  .ws-feed-avatar > :global(figure) {
    background: var(--immich-ui-light);
    color: var(--immich-ui-dark);
    box-shadow: inset 0 0 0 1px color-mix(in oklab, var(--immich-ui-dark) 38%, transparent);
  }
  /* someone the server no longer knows: an empty ring */
  .ws-feed-avatar-none {
    box-shadow: inset 0 0 0 1px var(--ws-hairline);
  }
  .ws-feed-body {
    min-width: 0;
  }
  .ws-feed-head {
    margin: 0;
    padding-top: 0.1rem;
    font-size: var(--ws-text-body);
    line-height: 1.45;
    overflow-wrap: anywhere;
  }
  .ws-feed-place {
    font-weight: 600;
    color: var(--immich-ui-dark);
    text-decoration: underline;
    text-decoration-color: transparent;
    text-underline-offset: 0.25em;
    transition: text-decoration-color 140ms cubic-bezier(0.22, 1, 0.36, 1);
  }
  .ws-feed-place:hover {
    text-decoration-color: var(--ws-accent);
  }
  .ws-feed-place:focus-visible,
  .ws-feed-album:focus-visible,
  .ws-feed-more:focus-visible,
  .ws-feed-link:focus-visible {
    outline: var(--ws-border) solid var(--ws-accent);
    outline-offset: 2px;
    border-radius: var(--ws-radius);
  }
  .ws-feed-sep {
    margin-inline: 0.35rem;
    color: var(--immich-ui-muted);
  }
  /* what nobody needs to look at (photos taken out, an album taken out, someone leaving) reads quieter */
  .ws-feed-quiet .ws-feed-what {
    color: var(--immich-ui-muted);
  }
  .ws-feed-people {
    margin: 0.15rem 0 0;
    color: var(--immich-ui-muted);
    font-size: var(--ws-text-meta);
  }
  .ws-feed-meta,
  .ws-feed-when {
    font-family: var(--ws-font-data);
    font-size: var(--ws-text-data);
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    color: var(--immich-ui-muted);
  }
  .ws-feed-meta {
    margin: 0.25rem 0 0;
  }
  .ws-feed-when {
    padding-top: 0.3rem;
    white-space: nowrap;
  }
  .ws-feed-album {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    margin-top: 0.4rem;
    font-size: var(--ws-text-ui);
    font-weight: 500;
    color: var(--immich-ui-dark);
  }
  .ws-feed-album :global(svg) {
    color: var(--immich-ui-muted);
  }
  a.ws-feed-album:hover span,
  .ws-feed-link:hover {
    text-decoration: underline;
    text-decoration-color: var(--ws-accent);
    text-underline-offset: 0.25em;
  }
  .ws-feed-quiet .ws-feed-album {
    color: var(--immich-ui-muted);
  }
  /* the photos: the grid's tiles (data-thumbnail-focus-container: the window radius, an inset hairline, the accent
     while pointed at or focused), square, on the desktop's gap; then +N, where the rest are */
  .ws-feed-strip {
    display: grid;
    grid-template-columns: repeat(7, minmax(0, 6.5rem));
    gap: calc(var(--ws-gap) * 0.5);
    margin-top: 0.7rem;
  }
  .ws-feed-tile {
    position: relative;
    display: block;
    aspect-ratio: 1;
    background: color-mix(in oklab, var(--immich-ui-dark) 6%, transparent);
  }
  .ws-feed-tile img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .ws-feed-more {
    display: grid;
    place-items: center;
    aspect-ratio: 1;
    border-radius: var(--ws-radius);
    box-shadow: inset 0 0 0 1px var(--ws-hairline);
    font-family: var(--ws-font-data);
    font-size: var(--ws-text-data);
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    color: var(--immich-ui-muted);
    transition:
      box-shadow 140ms cubic-bezier(0.22, 1, 0.36, 1),
      color 140ms cubic-bezier(0.22, 1, 0.36, 1);
  }
  .ws-feed-more:hover {
    color: var(--immich-ui-dark);
    box-shadow: inset 0 0 0 var(--ws-border) var(--ws-accent);
  }
  .ws-feed-more-narrow {
    display: none;
  }
  /* comments: each its text (the name first when several people wrote), beside the photo it is on */
  .ws-feed-comments {
    display: grid;
    gap: 0.55rem;
    margin: 0.6rem 0 0;
    padding: 0;
    list-style: none;
  }
  .ws-feed-comment {
    display: flex;
    align-items: flex-start;
    gap: 0.75rem;
  }
  .ws-feed-comment .ws-feed-tile {
    flex: none;
    width: 3rem;
  }
  .ws-feed-comment-text {
    margin: 0;
    max-width: 65ch;
    font-size: var(--ws-text-body);
    line-height: 1.5;
    overflow-wrap: anywhere;
  }
  .ws-feed-comment-who {
    margin-inline-end: 0.4rem;
    font-weight: 600;
  }
  .ws-feed-link {
    display: inline-block;
    margin-top: 0.5rem;
    font-size: var(--ws-text-ui);
    font-weight: 500;
    color: var(--immich-ui-muted);
  }
  .ws-feed-more-row {
    padding-top: 0.75rem;
    border-top: 1px solid var(--ws-hairline);
  }
  /* a phone: four tiles and +N, wider so a face still reads */
  @media (max-width: 639px) {
    .ws-feed-item {
      column-gap: 0.65rem;
    }
    .ws-feed-strip {
      grid-template-columns: repeat(5, minmax(0, 1fr));
    }
    .ws-feed-strip :global(.ws-feed-wide),
    .ws-feed-more-wide {
      display: none;
    }
    .ws-feed-more-narrow {
      display: grid;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .ws-feed-place,
    .ws-feed-more {
      transition: none;
    }
  }
</style>
