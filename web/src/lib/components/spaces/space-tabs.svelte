<script lang="ts">
  import { page } from '$app/state';
  import { createFilterState } from '$lib/components/filter-panel/filter-panel';
  import { Route } from '$lib/route';
  import { getSearchablePageFilterState, getSearchablePageState } from '$lib/utils/searchable-page-search';
  import { t } from 'svelte-i18n';

  interface Props {
    spaceId: string;
    faceRecognitionEnabled?: boolean;
    photoCount?: number;
    albumCount?: number;
    memberCount?: number;
    isAdmin?: boolean;
    libraryCount?: number;
    /**
     * Local Omarchy layer: a Space of one (Library, where the albums live): only the tabs that mean something to
     * one person; Members and Activity wait until someone joins, and Libraries until one is linked
     */
    personal?: boolean;
    /** Local Omarchy layer: the Space opens on its albums (its index route goes there), so Albums leads */
    albumsFirst?: boolean;
  }

  let {
    spaceId,
    faceRecognitionEnabled = false,
    photoCount = 0,
    albumCount = 0,
    memberCount = 0,
    isAdmin = false,
    libraryCount = 0,
    personal = false,
    albumsFirst = false,
  }: Props = $props();

  const base = $derived(`/spaces/${spaceId}`);
  const path = $derived(page.url.pathname);

  // Local Omarchy layer: where the bar has no room for every section they scroll sideways (layouts/UserPageLayout gives
  // them way before the Space's name); the one on screen is kept in the middle of what shows as the room changes and as
  // the page moves on
  let nav = $state<HTMLElement>();
  const showCurrent = () => {
    const current = nav?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!nav || !current || nav.scrollWidth <= nav.clientWidth) {
      return;
    }
    const box = nav.getBoundingClientRect();
    const tab = current.getBoundingClientRect();
    nav.scrollBy({ left: tab.left + tab.width / 2 - (box.left + box.width / 2) });
  };
  $effect(() => {
    void path;
    if (!nav) {
      return;
    }
    const resized = new ResizeObserver(() => showCurrent());
    resized.observe(nav);
    showCurrent();
    return () => resized.disconnect();
  });

  interface Tab {
    key: string;
    label: string;
    href: string;
    badge?: number;
    external?: boolean;
    active: boolean;
  }

  // Photos owns the index + the optional `/photos[/assetId]` segment.
  const photosActive = $derived(path === base || path.startsWith(`${base}/photos`));

  // #767a: this tab used to be a hard-coded `/map?spaceId=<id>`, which silently dropped every
  // active filter and the search term on the way to the map. The Photos tab URL-backs both, so
  // rebuild the link from the live URL while that tab is the one being viewed.
  const mapHref = $derived(
    photosActive
      ? Route.map({
          spaceId,
          query: getSearchablePageState(page.url).query,
          filters: { ...createFilterState(), ...getSearchablePageFilterState(page.url) },
        })
      : Route.map({ spaceId }),
  );

  const photosTab = $derived<Tab>({
    key: 'photos',
    label: $t('photos'),
    // the index route opens the albums when they lead, so Photos takes its own segment
    href: albumsFirst ? `${base}/photos` : base,
    badge: photoCount,
    active: photosActive,
  });

  const tabs = $derived<Tab[]>(
    (
      [
        albumsFirst ? undefined : photosTab,
        faceRecognitionEnabled
          ? {
              key: 'people',
              label: $t('people'),
              href: `${base}/people`,
              active: path.startsWith(`${base}/people`),
            }
          : undefined,
        {
          key: 'albums',
          label: $t('albums'),
          href: `${base}/albums`,
          badge: albumCount,
          active: path.startsWith(`${base}/albums`),
        },
        albumsFirst ? photosTab : undefined,
        // External libraries are admin-only, so the tab is too.
        isAdmin && !(personal && libraryCount === 0)
          ? {
              key: 'libraries',
              label: $t('spaces_libraries'),
              href: `${base}/libraries`,
              badge: libraryCount,
              active: path.startsWith(`${base}/libraries`),
            }
          : undefined,
        {
          key: 'map',
          label: $t('map'),
          href: mapHref,
          external: true,
          active: false,
        },
        personal
          ? undefined
          : {
              key: 'members',
              label: $t('members'),
              href: `${base}/members`,
              badge: memberCount,
              active: path.startsWith(`${base}/members`),
            },
        personal
          ? undefined
          : {
              key: 'activity',
              label: $t('spaces_activity'),
              href: `${base}/activity`,
              active: path.startsWith(`${base}/activity`),
            },
      ] as (Tab | undefined)[]
    ).filter((tab): tab is Tab => tab !== undefined),
  );
</script>

<!-- Local Omarchy layer: the Space's sections as one segmented control in the bar beside its name (the AI inbox's
     tabs), the one on screen inverted; a count is data, in mono after its label -->
<nav class="ws-seg ws-space-tabs" aria-label={$t('spaces')} data-testid="space-tabs" bind:this={nav}>
  {#each tabs as tab (tab.key)}
    <a
      href={tab.href}
      data-testid="space-tab-{tab.key}"
      data-sveltekit-preload-data={tab.external ? 'off' : undefined}
      aria-current={tab.active ? 'page' : undefined}
    >
      {tab.label}
      {#if tab.badge && tab.badge > 0}
        <span class="ws-space-tab-count">{tab.badge.toLocaleString()}</span>
      {/if}
    </a>
  {/each}
</nav>

<style>
  /* in the bar: no auto margin (the inbox pushes its tabs to the end), and it scrolls sideways before it crowds the
     name or the buttons */
  .ws-space-tabs {
    margin-inline-start: 0;
    min-width: 0;
    max-width: 100%;
    overflow-x: auto;
    scrollbar-width: none;
  }
  .ws-space-tabs > a {
    display: inline-flex;
    flex: none;
    align-items: baseline;
    gap: 0.4rem;
    padding: 0.3rem 0.75rem;
    border-radius: var(--ws-radius);
    color: var(--immich-ui-muted);
    font-size: var(--ws-text-ui);
    font-weight: 600;
    white-space: nowrap;
  }
  .ws-space-tabs > a:hover {
    color: var(--immich-ui-dark);
    background: color-mix(in oklab, var(--immich-ui-dark) 7%, transparent);
  }
  .ws-space-tabs > a[aria-current='page'] {
    background: var(--immich-ui-dark);
    color: var(--immich-ui-light);
  }
  .ws-space-tabs > a:focus-visible {
    outline: var(--ws-border) solid var(--ws-accent);
    outline-offset: 2px;
  }
  .ws-space-tab-count {
    font-family: var(--ws-font-data);
    font-size: var(--ws-text-data);
    font-variant-numeric: tabular-nums;
    opacity: 0.75;
  }
</style>
