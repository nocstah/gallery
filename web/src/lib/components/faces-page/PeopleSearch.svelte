<script lang="ts">
  import { initInput } from '$lib/actions/focus';
  import { maximumLengthSearchPeople } from '$lib/constants';
  import SearchBar from '$lib/elements/SearchBar.svelte';
  import { createPeopleSearch } from '$lib/gallery/people/people-search';
  import { handleError } from '$lib/utils/handle-error';
  import type { PersonResponseDto } from '@immich/sdk';
  import { onDestroy } from 'svelte';
  import { t } from 'svelte-i18n';

  interface Props {
    searchName: string;
    searchedPeopleLocal: PersonResponseDto[];
    type: 'searchBar' | 'input';
    numberPeopleToSearch?: number;
    inputClass?: string;
    showLoadingSpinner?: boolean;
    placeholder?: string;
    withSharedSpaces?: boolean;
    onReset?: () => void;
    onSearch?: () => void;
  }

  let {
    searchName = $bindable(),
    // eslint-disable-next-line no-useless-assignment
    searchedPeopleLocal = $bindable(),
    type,
    numberPeopleToSearch = maximumLengthSearchPeople,
    inputClass = 'w-full gap-2',
    showLoadingSpinner = $bindable(false),
    placeholder = $t('name_or_nickname'),
    withSharedSpaces = false,
    onReset = () => {},
    onSearch = () => {},
  }: Props = $props();

  const peopleSearch = createPeopleSearch({
    onResults: (people) => (searchedPeopleLocal = people),
    onLoading: (loading) => (showLoadingSpinner = loading),
    onError: (error) => handleError(error, $t('errors.cant_search_people')),
  });

  onDestroy(peopleSearch.cancel);

  const handleReset = () => {
    peopleSearch.reset();
    onReset();
  };

  export async function searchPeople(force?: boolean, name?: string) {
    searchName = name ?? searchName;
    onSearch();
    if (searchName === '') {
      handleReset();
      return;
    }
    await peopleSearch.search(searchName, { force, withSharedSpaces, numberPeopleToSearch });
  }
</script>

{#if type === 'searchBar'}
  <SearchBar
    bind:name={searchName}
    {showLoadingSpinner}
    {placeholder}
    onReset={handleReset}
    onSearch={({ force }) => searchPeople(force ?? false)}
  />
{:else}
  <input
    class={inputClass}
    type="text"
    {placeholder}
    bind:value={searchName}
    oninput={() => searchPeople(false)}
    use:initInput
  />
{/if}
