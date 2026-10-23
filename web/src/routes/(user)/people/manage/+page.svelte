<script lang="ts">
  import { goto } from '$app/navigation';
  import PeopleVisibilityModal from '$lib/components/people/people-visibility-modal.svelte';
  import type { VisibilityChange, VisibilityPerson, VisibilitySaveResult } from '$lib/components/people/people-types';
  import { visibilitiesDone } from '$lib/services/person.service';
  import { getPeopleThumbnailUrl } from '$lib/utils';
  import { handleError } from '$lib/utils/handle-error';
  import { sortInPeopleOrder } from '$lib/utils/people-order';
  import { getAllPeople, updatePeople, type PersonResponseDto } from '@immich/sdk';
  import { t } from 'svelte-i18n';
  import type { PageData } from './$types';

  interface Props {
    data: PageData;
  }

  const { data }: Props = $props();

  // Local Omarchy layer: in the People page's order (utils/people-order), set once as they load, so showing or hiding
  // someone never moves their tile
  let people = $derived(sortInPeopleOrder(data.people.people));
  const totalPeopleCount = $derived(data.people.total);
  let nextPage = $state(data.people.hasNextPage ? 2 : null);
  let loading = $state(false);

  const visibilityPeople: VisibilityPerson[] = $derived(
    people.map((person) => ({
      id: person.id,
      displayName: person.name,
      thumbnailUrl: getPeopleThumbnailUrl(person),
      isHidden: person.isHidden,
      type: person.type,
      species: person.species,
    })),
  );

  const saveVisibilityChanges = async (changes: VisibilityChange[]): Promise<VisibilitySaveResult> => {
    const results = await updatePeople({ peopleUpdateDto: { people: changes } });
    const successCount = results.filter(({ success }) => success).length;
    // Local Omarchy layer: the changes that took can be taken back, from the toast or the bar's undo history
    const done = new Set(results.filter(({ success }) => success).map(({ id }) => id));
    const undo = visibilitiesDone(
      $t,
      changes.filter(({ id }) => done.has(id)),
      people,
    );
    return { successCount, failCount: results.length - successCount, undo };
  };

  const handleUpdate = (updatedVisibilityPeople: VisibilityPerson[]) => {
    const hiddenById = new Map(updatedVisibilityPeople.map((person) => [person.id, person.isHidden]));
    people = people.map((person: PersonResponseDto) => {
      const nextHidden = hiddenById.get(person.id);
      return nextHidden === undefined || nextHidden === person.isHidden ? person : { ...person, isHidden: nextHidden };
    });
  };

  const loadNextPage = async () => {
    if (loading || !nextPage) {
      return;
    }

    loading = true;
    try {
      const { people: newPeople, hasNextPage } = await getAllPeople({ withHidden: true, page: nextPage });
      people = people.concat(sortInPeopleOrder(newPeople));
      nextPage = hasNextPage ? nextPage + 1 : null;
    } catch (error) {
      handleError(error, $t('errors.failed_to_load_people'));
    } finally {
      loading = false;
    }
  };
</script>

<PeopleVisibilityModal
  people={visibilityPeople}
  {totalPeopleCount}
  onClose={() => void goto('/people')}
  onUpdate={handleUpdate}
  hasMore={nextPage !== null}
  {loading}
  {loadNextPage}
  {saveVisibilityChanges}
/>
