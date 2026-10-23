import { searchPerson, type PersonResponseDto } from '@immich/sdk';
import { maximumLengthSearchPeople, timeBeforeShowLoadingSpinner } from '$lib/constants';
import { searchNameLocal } from '$lib/utils/person';

// SearchService.searchPerson caps shared-space results at 50; the owner-only repository caps at 100.
// A full batch must never be treated as the complete set of people matching a prefix.
const sharedPeopleSearchLimit = 50;

type SearchOptions = {
  force?: boolean;
  withSharedSpaces?: boolean;
  numberPeopleToSearch?: number;
};

type SearchCallbacks = {
  onResults: (people: PersonResponseDto[]) => void;
  onLoading: (loading: boolean) => void;
  onError: (error: unknown) => void;
};

export const createPeopleSearch = ({ onResults, onLoading, onError }: SearchCallbacks) => {
  let cached: { name: string; withSharedSpaces: boolean; people: PersonResponseDto[] } | undefined;
  let activeRequest: AbortController | undefined;
  let loadingTimeout: ReturnType<typeof setTimeout> | undefined;

  const cancel = () => {
    activeRequest?.abort();
    activeRequest = undefined;
    clearTimeout(loadingTimeout);
    loadingTimeout = undefined;
    onLoading(false);
  };

  const reset = () => {
    cancel();
    cached = undefined;
    onResults([]);
  };

  const search = async (
    name: string,
    { force = false, withSharedSpaces = false, numberPeopleToSearch = maximumLengthSearchPeople }: SearchOptions = {},
  ) => {
    // Cancel even when the next search can use the cache, or an older request can replace that result.
    cancel();
    if (!name) {
      reset();
      return;
    }

    const resultLimit = withSharedSpaces ? sharedPeopleSearchLimit : maximumLengthSearchPeople;
    if (
      !force &&
      cached?.withSharedSpaces === withSharedSpaces &&
      cached.people.length > 0 &&
      cached.people.length < resultLimit &&
      name.startsWith(cached.name)
    ) {
      onResults(searchNameLocal(name, cached.people, numberPeopleToSearch));
      return;
    }

    const request = new AbortController();
    activeRequest = request;
    loadingTimeout = setTimeout(() => onLoading(true), timeBeforeShowLoadingSpinner);
    try {
      const people = await searchPerson(
        { name, ...(withSharedSpaces && { withSharedSpaces }) },
        { signal: request.signal },
      );
      if (activeRequest !== request) {
        return;
      }
      cached = { name, withSharedSpaces, people };
      onResults(searchNameLocal(name, people, numberPeopleToSearch));
    } catch (error) {
      if (activeRequest === request) {
        onError(error);
      }
    } finally {
      if (activeRequest === request) {
        clearTimeout(loadingTimeout);
        loadingTimeout = undefined;
        activeRequest = undefined;
        onLoading(false);
      }
    }
  };

  return { search, reset, cancel };
};
