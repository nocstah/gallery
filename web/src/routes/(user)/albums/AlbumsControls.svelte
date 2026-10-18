<script lang="ts">
  import GroupTab from '$lib/elements/GroupTab.svelte';
  import SearchBar from '$lib/elements/SearchBar.svelte';
  import { AlbumFilter, albumViewSettings } from '$lib/stores/preferences.store';
  import { createAlbumAndRedirect, findFilterOption } from '$lib/utils/album-utils';
  import { Button } from '@immich/ui';
  import { mdiPlusBoxOutline } from '@mdi/js';
  import { t } from 'svelte-i18n';
  import AlbumsViewMenu from './AlbumsViewMenu.svelte';

  interface Props {
    albumGroups: string[];
    searchQuery: string;
  }

  let { albumGroups, searchQuery = $bindable() }: Props = $props();

  const handleChangeAlbumFilter = (filter: string, defaultFilter: AlbumFilter) => {
    $albumViewSettings.filter =
      Object.keys(albumFilterNames).find((key) => albumFilterNames[key as AlbumFilter] === filter) ?? defaultFilter;
  };

  let albumFilterNames: Record<AlbumFilter, string> = $derived({
    [AlbumFilter.All]: $t('all'),
    [AlbumFilter.Owned]: $t('owned'),
    [AlbumFilter.Shared]: $t('shared'),
  });

  let selectedFilterOption = $derived(albumFilterNames[findFilterOption($albumViewSettings.filter)]);
</script>

<!-- Filter Albums by Sharing Status (All, Owned, Shared) -->
<div class="hidden h-10 xl:block">
  <GroupTab
    label={$t('show_albums')}
    filters={Object.values(albumFilterNames)}
    selected={selectedFilterOption}
    onSelect={(selected) => handleChangeAlbumFilter(selected, AlbumFilter.All)}
  />
</div>

<!-- Search Albums -->
<div class="hidden h-10 xl:block xl:w-60 2xl:w-80">
  <SearchBar placeholder={$t('search_albums')} bind:name={searchQuery} showLoadingSpinner={false} />
</div>

<!-- Local Omarchy layer: the sort, its order, the grouping (and every group opened or closed at once) and covers or
     list, in one sheet like the bar's View menu, where each had a control of its own in the bar -->
<AlbumsViewMenu {albumGroups} />

<!-- Create Album -->
<Button
  leadingIcon={mdiPlusBoxOutline}
  onclick={() => createAlbumAndRedirect()}
  size="small"
  variant="ghost"
  color="secondary"
>
  <p class="hidden md:block">{$t('create_album')}</p>
</Button>
