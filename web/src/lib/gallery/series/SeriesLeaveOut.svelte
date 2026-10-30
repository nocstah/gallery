<script lang="ts">
  // Local Omarchy layer: who a series leaves out (gallery/series). Curator keeps only Gallery person ids; their names and
  // faces come from Gallery with the owner's session, each person once while the page is open. Add someone opens the
  // people picker Kioku already has, without the people already listed; each change is saved at once.
  import PeoplePickerModal from '$lib/modals/PeoplePickerModal.svelte';
  import { getPeopleThumbnailUrl } from '$lib/utils';
  import { getPerson, type PersonResponseDto } from '@immich/sdk';
  import { Icon, modalManager } from '@immich/ui';
  import { mdiClose, mdiPlus } from '@mdi/js';
  import { untrack } from 'svelte';
  import { t } from 'svelte-i18n';
  import { SvelteMap } from 'svelte/reactivity';

  type Props = {
    /** the people left out: Gallery person ids */
    ids: string[];
    /** a change is being saved */
    saving?: boolean;
    onChange: (ids: string[]) => void;
  };

  let { ids, saving = false, onChange }: Props = $props();

  // what Gallery says of each person asked about: undefined while it is asked, null where it has no such person (any
  // more); the list alone says when to ask
  const people = new SvelteMap<string, PersonResponseDto | null | undefined>();

  $effect(() => {
    for (const id of ids) {
      untrack(() => {
        if (people.has(id)) {
          return;
        }
        people.set(id, undefined);
        getPerson({ id })
          .then((person) => people.set(id, person))
          .catch(() => people.set(id, null));
      });
    }
  });

  // nothing while Gallery is asked; a person it no longer has is unknown, one without a name unnamed
  const nameOf = (id: string) => {
    const person = people.get(id);
    if (person === undefined) {
      return '';
    }
    return person === null ? $t('unknown') : person.name || $t('cmdk_unnamed_person');
  };

  const add = async () => {
    const picked = await modalManager.show(PeoplePickerModal, { multiple: true, excludedIds: ids });
    const added = (picked ?? []).filter(({ id }) => !ids.includes(id));
    if (added.length === 0) {
      return;
    }
    for (const person of added) {
      people.set(person.id, person);
    }
    onChange([...ids, ...added.map(({ id }) => id)]);
  };

  const initial = (name: string) => name.trim().charAt(0).toLocaleUpperCase();
</script>

<section class="ws-sharing-section" aria-labelledby="series-leave-out" data-testid="series-leave-out">
  <h2 class="ws-sharing-heading" id="series-leave-out">{$t('memory_series_leave_out')}</h2>
  <p class="ws-sharing-none">{$t('memory_series_leave_out_body')}</p>
  <ul class="series-people" aria-busy={saving || undefined}>
    {#each ids as id (id)}
      {@const person = people.get(id)}
      {@const name = nameOf(id)}
      <li class="series-person" data-testid="series-person" data-id={id}>
        {#if person}
          <img src={getPeopleThumbnailUrl(person)} alt="" loading="lazy" draggable="false" />
        {:else}
          <span class="series-person-initial" aria-hidden="true">{initial(name)}</span>
        {/if}
        <span class="series-person-name">{name}</span>
        <button
          type="button"
          class="series-person-remove"
          disabled={saving}
          aria-label={$t('memory_series_leave_out_remove', { values: { name } })}
          title={$t('memory_series_leave_out_remove', { values: { name } })}
          onclick={() => onChange(ids.filter((other) => other !== id))}
        >
          <Icon icon={mdiClose} size="14" aria-hidden />
        </button>
      </li>
    {/each}
  </ul>
  <button type="button" class="ws-btn-quiet series-people-add" disabled={saving} onclick={add}>
    <Icon icon={mdiPlus} size="16" aria-hidden />
    {$t('memory_series_leave_out_add')}
  </button>
</section>

<style>
  .series-people {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem;
    margin-top: 0.75rem;
    list-style: none;
  }
  .series-people:empty {
    display: none;
  }
  /* a person as the album's people strip shows one: the face and the name in a hairline frame */
  .series-person {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    height: 2rem;
    padding-inline: 0.125rem;
    border-radius: var(--ws-radius);
    font-size: var(--ws-text-meta);
    font-weight: 500;
    color: var(--immich-ui-dark);
    box-shadow: inset 0 0 0 1px var(--ws-hairline);
  }
  /* a face stays round */
  img,
  .series-person-initial {
    flex: none;
    width: 1.75rem;
    height: 1.75rem;
    border-radius: 9999px;
  }
  img {
    object-fit: cover;
  }
  .series-person-initial {
    display: grid;
    place-items: center;
    font-weight: 600;
    box-shadow: inset 0 0 0 1px color-mix(in oklab, currentColor 38%, transparent);
  }
  .series-person-name {
    white-space: nowrap;
  }
  .series-person-remove {
    display: grid;
    place-items: center;
    width: 1.75rem;
    height: 1.75rem;
    border-radius: var(--ws-radius);
    color: var(--immich-ui-muted);
  }
  .series-person-remove:hover {
    background: color-mix(in oklab, var(--immich-ui-dark) 7%, transparent);
    color: var(--immich-ui-dark);
  }
  .series-person-remove:focus-visible {
    outline: var(--ws-border) solid var(--ws-accent);
    outline-offset: 2px;
  }
  .series-person-remove:disabled,
  .series-people-add:disabled {
    opacity: 0.45;
    pointer-events: none;
  }
  .series-people-add {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    margin-top: 0.75rem;
    margin-inline-start: -0.6rem;
  }
</style>
