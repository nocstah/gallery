<script lang="ts">
  // Local Omarchy layer: a shared link as a calm row of the Shared links page, where upstream drew a card: its cover,
  // what it shows in ink (the album's name, the memory's, or how many photos), and one muted line on who can open it
  // and when it ends, in words and calendar days (utils/shared-link-words), with what it allows beyond looking. Its
  // actions sit at the row's end: Copy, Edit and Turn off, which deletes the link (the memory Share sheet's Turn off
  // does the same), so whoever opens it reads that it has ended. A link that has ended is Edit, to open it again, and
  // Remove. On a phone the three fold into one ⋮.
  import { goto } from '$app/navigation';
  import { eventManager } from '$lib/managers/event-manager.svelte';
  import { Route } from '$lib/route';
  import { asUrl } from '$lib/services/shared-link.service';
  import { locale } from '$lib/stores/preferences.store';
  import { copyToClipboard, getAssetMediaUrl } from '$lib/utils';
  import { handleError } from '$lib/utils/handle-error';
  import { linkEnd, linkKind, linkName } from '$lib/utils/shared-link-words';
  import { AssetMediaSize, removeSharedLink, type SharedLinkResponseDto } from '@immich/sdk';
  import { ContextMenuButton, Icon, MenuItemType, modalManager, toastManager, type ActionItem } from '@immich/ui';
  import { mdiContentCopy, mdiImageMultipleOutline, mdiLinkOff, mdiPencilOutline, mdiTrashCanOutline } from '@mdi/js';
  import { DateTime } from 'luxon';
  import { t } from 'svelte-i18n';

  type Props = {
    sharedLink: SharedLinkResponseDto;
  };

  const { sharedLink }: Props = $props();

  const kind = $derived(linkKind(sharedLink));
  const end = $derived(linkEnd(sharedLink.expiresAt));
  const ended = $derived(end.state === 'ended');
  const titleId = $derived(`shared-link-${sharedLink.id}`);

  // the cover: the album's, or the first photo the link holds
  const coverId = $derived(
    sharedLink.album ? sharedLink.album.albumThumbnailAssetId : (sharedLink.assets[0]?.id ?? null),
  );

  // what it shows: an album or a memory by its name, photos by their link's own words or how many they are
  const named = $derived(linkName($t, sharedLink));
  const title = $derived(named.name);
  const what = $derived(named.what);

  const day = (date: DateTime) =>
    date.setLocale($locale).toLocaleString({
      day: 'numeric',
      month: 'short',
      ...(date.year !== DateTime.now().year && { year: 'numeric' }),
    });
  const endWords = $derived.by(() => {
    switch (end.state) {
      case 'never': {
        return $t('shared_links_row_never');
      }
      case 'ended': {
        return $t('shared_links_row_ended', { values: { when: end.when, date: day(end.date) } });
      }
      default: {
        return $t('shared_links_row_ends', { values: { when: end.when, days: end.days, date: day(end.date) } });
      }
    }
  });
  const endTitle = $derived(
    end.state === 'never' ? undefined : end.date.setLocale($locale).toLocaleString(DateTime.DATETIME_MED),
  );

  // the line: what it is (where the title does not say), who can open it, when it ends, then what it lets a visitor
  // do beyond looking
  type Fact = { text: string; end?: boolean; ended?: boolean; title?: string };
  // between two facts, as text (spaces and all), so they read apart
  const separator = ' · ';
  const facts = $derived.by(() => {
    const list: Fact[] = [];
    if (what) {
      list.push({ text: what });
    }
    list.push(
      { text: $t('shared_links_row_who', { values: { password: sharedLink.password ? 'yes' : 'no' } }) },
      { text: endWords, end: true, ended, title: endTitle },
    );
    if (sharedLink.allowUpload) {
      list.push({ text: $t('shared_links_row_upload') });
    }
    if (sharedLink.showMetadata) {
      list.push({ text: $t('shared_links_row_location') });
    }
    return list;
  });

  const copy = () => copyToClipboard(asUrl(sharedLink));

  const turnOff = async () => {
    const confirmed = await modalManager.showDialog({
      title: $t(ended ? 'shared_links_remove_title' : 'shared_links_turn_off_title'),
      prompt: $t(ended ? 'shared_links_remove_prompt' : 'shared_links_turn_off_prompt', { values: { name: title } }),
      confirmText: $t(ended ? 'remove' : 'shared_links_row_turn_off'),
      confirmColor: 'danger',
    });
    if (!confirmed) {
      return;
    }
    try {
      await removeSharedLink({ id: sharedLink.id });
      eventManager.emit('SharedLinkDelete', sharedLink);
      toastManager.primary($t(ended ? 'shared_links_removed' : 'shared_links_turned_off'));
    } catch (error) {
      handleError(error, $t('errors.unable_to_delete_shared_link'));
    }
  };

  const Copy: ActionItem = $derived({
    title: $t('shared_links_row_copy'),
    icon: mdiContentCopy,
    onAction: () => void copy(),
  });
  const Edit: ActionItem = $derived({
    title: $t('edit'),
    icon: mdiPencilOutline,
    onAction: () => void goto(Route.editSharedLink(sharedLink)),
  });
  const TurnOff: ActionItem = $derived({
    title: ended ? $t('remove') : $t('shared_links_row_turn_off'),
    icon: ended ? mdiTrashCanOutline : mdiLinkOff,
    color: 'danger',
    onAction: () => void turnOff(),
  });
  const actions = $derived(ended ? [Edit, TurnOff] : [Copy, Edit, TurnOff]);
</script>

<li class="ws-link-row" data-testid="shared-link-row" data-kind={kind} data-ended={ended || undefined}>
  <span class="ws-link-cover" aria-hidden="true">
    {#if coverId}
      <img src={getAssetMediaUrl({ id: coverId, size: AssetMediaSize.Thumbnail })} alt="" loading="lazy" />
    {:else}
      <Icon icon={mdiImageMultipleOutline} size="22" />
    {/if}
  </span>
  <div class="ws-link-text">
    {#if ended}
      <span class="ws-link-title" id={titleId}>{title}</span>
    {:else}
      <a class="ws-link-title" id={titleId} href={Route.viewSharedLink(sharedLink)}>{title}</a>
    {/if}
    <p class="ws-link-facts" data-testid="shared-link-facts">
      {#each facts as fact, index (index)}{#if index > 0}{separator}{/if}<span
          class={{ 'ws-link-end': fact.end, 'ws-link-ended': fact.ended }}
          title={fact.title}>{fact.text}</span
        >{/each}
    </p>
  </div>
  <div class="ws-link-actions">
    {#each actions as action (action.title)}
      <button
        type="button"
        class={['ws-link-action', action.color === 'danger' && 'ws-link-action-danger']}
        aria-describedby={titleId}
        onclick={(event) => action.onAction({ action, event })}
      >
        <Icon icon={action.icon ?? ''} size="16" aria-hidden />
        {action.title}
      </button>
    {/each}
  </div>
  <div class="ws-link-menu">
    <ContextMenuButton
      aria-label={$t('shared_link_options')}
      position="top-right"
      items={ended ? [Edit, MenuItemType.Divider, TurnOff] : [Copy, Edit, MenuItemType.Divider, TurnOff]}
    />
  </div>
</li>

<style>
  /* a row on the ground split from the next by a hairline: the cover, the words, the actions at the end */
  .ws-link-row {
    display: grid;
    grid-template-columns: 3.5rem minmax(0, 1fr) auto;
    gap: 0.9rem;
    align-items: center;
    padding: 0.6rem 0.5rem;
    border-bottom: 1px solid var(--ws-hairline);
    color: var(--immich-ui-dark);
  }
  /* the cover: a small square tile, the hairline inside it as on every tile */
  .ws-link-cover {
    position: relative;
    display: grid;
    place-items: center;
    width: 3.5rem;
    height: 3.5rem;
    overflow: hidden;
    border-radius: var(--ws-radius);
    background: color-mix(in oklab, var(--immich-ui-dark) 6%, transparent);
    color: var(--immich-ui-muted);
  }
  .ws-link-cover img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .ws-link-cover::after {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: inherit;
    box-shadow: inset 0 0 0 1px var(--ws-hairline);
    pointer-events: none;
  }
  .ws-link-row[data-ended] .ws-link-cover img {
    opacity: 0.45;
    filter: grayscale(1);
  }
  .ws-link-text {
    display: grid;
    gap: 0.15rem;
    min-width: 0;
  }
  .ws-link-title {
    justify-self: start;
    max-width: 100%;
    overflow: hidden;
    font-size: var(--ws-text-ui);
    font-weight: 600;
    line-height: 1.35;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  a.ws-link-title:hover {
    text-decoration: underline;
    text-decoration-color: var(--ws-accent);
    text-underline-offset: 0.25em;
  }
  a.ws-link-title:focus-visible {
    outline: var(--ws-border) solid var(--ws-accent);
    outline-offset: 2px;
  }
  .ws-link-row[data-ended] .ws-link-title {
    color: var(--immich-ui-muted);
  }
  /* who can open it and when it ends, in muted meta; a link that has ended says so in the danger role */
  .ws-link-facts {
    color: var(--immich-ui-muted);
    font-size: var(--ws-text-meta);
    line-height: 1.45;
  }
  /* when it ends keeps its words together ("Ends Nov 17" had broken after "Nov" on a phone) */
  .ws-link-end {
    white-space: nowrap;
  }
  .ws-link-ended {
    color: var(--ws-danger);
  }
  /* the actions: quiet words with their icons; Turn off in the danger role, inverted in it when pointed at, as a
     menu's destructive row */
  .ws-link-actions {
    display: flex;
    gap: 0.15rem;
  }
  .ws-link-action {
    display: inline-flex;
    gap: 0.35rem;
    align-items: center;
    min-height: 2.25rem;
    padding: 0.3rem 0.6rem;
    border-radius: var(--ws-radius);
    color: var(--immich-ui-dark);
    font-size: var(--ws-text-ui);
    font-weight: 500;
    white-space: nowrap;
    transition:
      background-color 120ms,
      color 120ms;
  }
  .ws-link-action:hover {
    background: color-mix(in oklab, var(--immich-ui-dark) 8%, transparent);
  }
  .ws-link-action-danger {
    color: var(--ws-danger);
  }
  .ws-link-action-danger:hover {
    background: var(--ws-danger);
    color: var(--immich-ui-light);
  }
  .ws-link-action:focus-visible {
    outline: var(--ws-border) solid var(--ws-accent);
    outline-offset: -2px;
  }
  .ws-link-menu {
    display: none;
  }
  /* on a phone the actions fold into one ⋮ */
  @media (max-width: 639px) {
    .ws-link-row {
      gap: 0.75rem;
      padding-inline: 0;
    }
    .ws-link-actions {
      display: none;
    }
    .ws-link-menu {
      display: block;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .ws-link-action {
      transition: none;
    }
  }
</style>
