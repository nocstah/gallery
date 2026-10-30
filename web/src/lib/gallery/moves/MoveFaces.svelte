<script lang="ts">
  // Local Omarchy layer: Faces in <library>, after a person's move (gallery/moves, D8): where this library's own face
  // recognition put the faces of the person moved, as the mover read them (ids and counts only). The people come
  // through this library's API under the owner's session, as the People page shows them: a face and a name. A row
  // the mover proposes for a merge or a name links to Kioku's own views, where the owner decides; this page never
  // merges, renames or hides anyone.
  import { getPerson, type PersonResponseDto } from '@immich/sdk';
  import { untrack } from 'svelte';
  import { locale, t } from 'svelte-i18n';
  import { Route } from '$lib/route';
  import { getGlobalPersonThumbnailUrl } from '$lib/utils/global-person-route';
  import type { MoveFacesProposal, MoveFacesReport } from './mover';

  type Props = { report: MoveFacesReport; names: { source: string; library: string } };

  let { report, names }: Props = $props();

  let people = $state<Record<string, PersonResponseDto | null>>({});

  const isMerge = (proposal: MoveFacesProposal): proposal is Extract<MoveFacesProposal, { into: string }> =>
    'into' in proposal;

  // each person once, through this library's own API; a person it cannot read keeps the words for no name
  $effect(() => {
    const wanted = new Set([
      ...report.people.map(({ id }) => id),
      ...report.proposals.filter((proposal) => isMerge(proposal)).map(({ into }) => into),
    ]);
    untrack(() => {
      for (const id of wanted) {
        if (Object.hasOwn(people, id)) {
          continue;
        }
        people[id] = null;
        void getPerson({ id })
          .then((person) => (people[id] = person))
          .catch(() => undefined);
      }
    });
  });

  const number = (value: number) => value.toLocaleString($locale ?? undefined);
  const nameOf = (id: string) => people[id]?.name || $t('moves_faces_unnamed');
  const proposalFor = (id: string) =>
    report.proposals.find((proposal) => ('merge' in proposal ? proposal.merge === id : proposal.name === id));
  // done: on a person, or read without the face; while this library still reads photos, a face it has found but not
  // yet put on anyone is part of the work under way, said once as the progress, never as a count of its own
  const done = $derived(Math.max(0, report.photos - report.waiting - report.unassigned));
</script>

<section class="ws-move-faces" data-testid="move-faces">
  <h2>{$t('moves_faces_title', { values: names })}</h2>
  {#if report.waiting > 0}
    <p>{$t('moves_faces_progress', { values: { ...names, done, total: report.photos } })}</p>
  {/if}
  {#if report.people.length > 0}
    <p>{$t('moves_faces_people', { values: names })}</p>
    <ul>
      {#each report.people as row (row.id)}
        {@const person = people[row.id]}
        {@const proposal = proposalFor(row.id)}
        <li data-testid="move-faces-person">
          {#if person}
            <img class="ws-move-face" src={getGlobalPersonThumbnailUrl(person)} alt="" loading="lazy" />
          {:else}
            <span class="ws-move-face" aria-hidden="true"></span>
          {/if}
          <span class="ws-move-faces-name">{row.named ? nameOf(row.id) : $t('moves_faces_unnamed')}</span>
          <span class="ws-move-faces-count">{number(row.faces)}</span>
          {#if proposal && 'into' in proposal && people[proposal.into]}
            <a href={Route.viewPerson({ id: proposal.into }, { action: 'merge' })}
              >{$t('moves_faces_merge', { values: { name: nameOf(proposal.into) } })}</a
            >
          {:else if proposal && 'name' in proposal}
            <a href={Route.viewPerson({ id: row.id })}>{$t('moves_faces_name')}</a>
          {/if}
        </li>
      {/each}
    </ul>
  {/if}
  {#if report.unmatched > 0}
    <p class="ws-move-faces-muted">{$t('moves_faces_unmatched', { values: { ...names, count: report.unmatched } })}</p>
  {/if}
  {#if report.waiting === 0 && report.unassigned > 0}
    <p class="ws-move-faces-muted">
      {$t('moves_faces_unassigned', { values: { ...names, count: report.unassigned } })}
    </p>
  {/if}
</section>

<style>
  .ws-move-faces {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  h2 {
    font-size: var(--ws-text-ui);
    font-weight: 600;
  }
  /* people as the People page shows them: a round face, the name, the count in data type, a plain link */
  ul {
    display: flex;
    flex-direction: column;
  }
  li {
    display: flex;
    gap: 0.75rem;
    align-items: center;
    min-height: 3rem;
    padding: 0.25rem 0;
  }
  li + li {
    border-top: 1px solid var(--ws-hairline);
  }
  .ws-move-face {
    flex: none;
    width: 2.25rem;
    height: 2.25rem;
    border-radius: 9999px;
    object-fit: cover;
    background: color-mix(in oklab, var(--immich-ui-dark) 8%, transparent);
  }
  .ws-move-faces-name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-weight: 500;
  }
  .ws-move-faces-count {
    flex: none;
    font-family: var(--ws-font-data);
    font-size: var(--ws-text-data);
    font-variant-numeric: tabular-nums;
    color: var(--immich-ui-muted);
  }
  a {
    flex: none;
    font-size: var(--ws-text-meta);
    font-weight: 600;
    color: var(--immich-ui-dark);
    text-decoration: underline;
    text-decoration-color: var(--ws-hairline);
    text-underline-offset: 0.2em;
  }
  a:hover {
    text-decoration-color: var(--ws-accent);
  }
  a:focus-visible {
    outline: var(--ws-border) solid var(--ws-accent);
    outline-offset: 2px;
  }
  .ws-move-faces-muted {
    font-size: var(--ws-text-meta);
    color: var(--immich-ui-muted);
  }
</style>
