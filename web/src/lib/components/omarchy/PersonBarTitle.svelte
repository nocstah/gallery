<script lang="ts">
  // Local Omarchy layer: a person's face and name in the one bar, the name in the bar's heading face (the person page
  // lives in the shell since 2026-10-15). Someone who may edit the person renames them in place: a click makes the name
  // a field, and the people whose names match what is typed drop down under it (picking one offers to merge, as the
  // page's old name field did). Enter or leaving the field saves, Escape keeps the old name; the page decides what a
  // new name does, since it may be someone else's.
  import { clickOutside } from '$lib/actions/click-outside';
  import { listNavigation } from '$lib/actions/list-navigation';
  import ImageThumbnail from '$lib/components/assets/thumbnail/ImageThumbnail.svelte';
  import SearchPeople from '$lib/components/faces-page/PeopleSearch.svelte';
  import { portal } from '$lib/elements/Portal.svelte';
  import { getGlobalPersonThumbnailUrl } from '$lib/utils/global-person-route';
  import type { PersonResponseDto } from '@immich/sdk';
  import { LoadingSpinner } from '@immich/ui';
  import { tick } from 'svelte';
  import { t } from 'svelte-i18n';

  type Props = {
    person: PersonResponseDto;
    thumbnailUrl: string;
    editable: boolean;
    onRename: (name: string) => void;
    onPick: (person: PersonResponseDto) => void;
  };

  const { person, thumbnailUrl, editable, onRename, onPick }: Props = $props();

  const MATCHES = 5;
  let editing = $state(false);
  // the guard against saving twice is a plain flag, not state: removing the portalled list (in its action's teardown)
  // takes the focus with it, and Svelte answers a read of state during a teardown with its old value, so `editing`
  // would still read true there and that focusout would save a name Escape had just dropped
  let open = false;
  let draft = $state('');
  let matches = $state<PersonResponseDto[]>([]);
  let searching = $state(false);
  let form = $state<HTMLFormElement>();
  let list = $state<HTMLElement>();
  let place = $state({ left: 0, top: 0, width: 0 });

  const others = $derived(matches.filter(({ id }) => id !== person.id));
  // a name of a few letters keeps its own width (the 5ch floor would leave a gap after it) and never gives way
  const shortName = $derived(!!person.name && person.name.length <= 5);
  const showList = $derived(editing && (searching || others.length > 0));

  // the list is portalled out of the bar (whose title row clips), so it is placed under the field by hand
  const placeList = () => {
    const box = form?.getBoundingClientRect();
    if (box) {
      place = { left: box.left, top: box.bottom + 4, width: box.width };
    }
  };

  const edit = async () => {
    draft = person.name;
    matches = [];
    open = true;
    editing = true;
    await tick();
    form?.querySelector('input')?.select();
    placeList();
  };

  const finish = (save: boolean) => {
    if (!open) {
      return;
    }
    open = false;
    editing = false;
    matches = [];
    const name = draft.replaceAll('\n', ' ').trim();
    if (save && name !== person.name) {
      onRename(name);
    }
  };

  const pick = (other: PersonResponseDto) => {
    open = false;
    editing = false;
    matches = [];
    onPick(other);
  };

  const onSubmit = (event: SubmitEvent) => {
    event.preventDefault();
    finish(true);
  };

  // Escape keeps the old name (the action stops it there: the timeline's Escape would leave the page)
  const escape = { onEscape: () => finish(false) };

  // leaving the field saves, unless the focus only moved between the field and its list
  const onFocusOut = (event: FocusEvent) => {
    const next = event.relatedTarget;
    if (next instanceof Node && (form?.contains(next) || list?.contains(next))) {
      return;
    }
    finish(true);
  };
</script>

<svelte:window onresize={() => editing && placeList()} />

<ImageThumbnail
  circle
  url={thumbnailUrl}
  altText={person.name}
  widthStyle="1.75rem"
  heightStyle="1.75rem"
  class="ws-person-bar-face"
/>

{#if editing}
  <form
    bind:this={form}
    class="ws-person-bar-form"
    autocomplete="off"
    onsubmit={onSubmit}
    onfocusout={onFocusOut}
    use:clickOutside={escape}
    use:listNavigation={list}
  >
    <SearchPeople
      bind:searchName={draft}
      bind:searchedPeopleLocal={matches}
      bind:showLoadingSpinner={searching}
      type="input"
      numberPeopleToSearch={MATCHES}
      withSharedSpaces
      placeholder={$t('add_a_name')}
      inputClass="ws-person-bar-title ws-person-bar-field"
    />
  </form>
  {#if showList}
    <div
      bind:this={list}
      use:portal
      use:listNavigation={list}
      class="ws-person-matches"
      style:left="{place.left}px"
      style:top="{place.top}px"
      style:min-width="max({place.width}px, 16rem)"
      role="menu"
      aria-label={$t('people')}
      tabindex="-1"
      onfocusout={onFocusOut}
      use:clickOutside={escape}
    >
      {#if searching}
        <div class="ws-person-matches-wait"><LoadingSpinner /></div>
      {:else}
        {#each others as other (other.id)}
          <!-- the field keeps the focus while the pointer picks, so picking never saves the half-typed name -->
          <button
            type="button"
            role="menuitem"
            class="ws-person-match"
            onmousedown={(event) => event.preventDefault()}
            onclick={() => pick(other)}
          >
            <img src={getGlobalPersonThumbnailUrl(other)} alt="" draggable="false" />
            <span>{other.name}</span>
          </button>
        {/each}
      {/if}
    </div>
  {/if}
{:else}
  <!-- the name is the page's h1 (DESIGN.md, One heading), the face beside it; while it is a field (a form, which a
       heading cannot hold) the page goes without one -->
  <h1 class="ws-person-bar-heading" class:ws-person-bar-short={shortName}>
    {#if editable}
      <button
        type="button"
        class="ws-person-bar-title ws-person-bar-rename"
        class:ws-person-bar-unnamed={!person.name}
        class:ws-person-bar-short={shortName}
        title={$t('edit_name')}
        onclick={edit}
      >
        {person.name || $t('add_a_name')}
      </button>
    {:else}
      <span
        class="ws-person-bar-title"
        class:ws-person-bar-unnamed={!person.name}
        class:ws-person-bar-short={shortName}
      >
        {person.name || $t('unknown')}
      </span>
    {/if}
  </h1>
{/if}

<style>
  /* a face stays round; it sits on the row's middle (the title row lines its text up on one baseline). A phone's bar
     keeps its room for the name */
  :global(.ws-person-bar-face) {
    flex: none;
    align-self: center;
  }
  @media (max-width: 639px) {
    :global(.ws-person-bar-face) {
      display: none;
    }
  }
  /* the bar's heading role, as UserPageLayout sets a page's title and AlbumBarTitle an album's name; the h1 around the
     name takes the same face, so the name's few letters (ch) measure alike in both */
  .ws-person-bar-heading,
  .ws-person-bar-title,
  .ws-person-bar-form :global(.ws-person-bar-title) {
    font-family: var(--font-display);
    font-size: var(--ws-text-bar);
    font-weight: 750;
    font-stretch: 75%;
    line-height: 1.15;
    letter-spacing: -0.01em;
    word-spacing: 0.06em;
    color: var(--immich-ui-dark);
  }
  /* the description ellipsizes first, then the name, never below a few letters. The h1 is the title row's item, the
     name its one box inside it, on the name's baseline (UserPageLayout's fitting reads the name in it) */
  .ws-person-bar-heading {
    display: flex;
    flex: 0 1 auto;
    align-items: baseline;
    min-width: 5ch;
  }
  .ws-person-bar-title,
  .ws-person-bar-form :global(.ws-person-bar-title) {
    flex: 0 1 auto;
    min-width: 5ch;
    max-width: 32ch;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .ws-person-bar-short {
    flex-shrink: 0;
    min-width: 0;
  }
  .ws-person-bar-unnamed {
    color: var(--immich-ui-muted);
  }
  /* no negative margins: the bar's fitting reads them as the name overflowing its room */
  .ws-person-bar-rename {
    padding: 0.125rem 0.25rem;
    border-radius: var(--ws-radius);
    text-align: start;
    cursor: text;
  }
  .ws-person-bar-rename:hover {
    background: color-mix(in oklab, var(--immich-ui-dark) 6%, transparent);
  }
  /* inside, as the field's below: the title row would clip a ring drawn outside */
  .ws-person-bar-rename:focus-visible {
    outline: none;
    box-shadow: inset 0 0 0 var(--ws-border) var(--ws-accent);
  }
  .ws-person-bar-form {
    display: flex;
    min-width: 0;
  }
  /* the focus ring is drawn inside the field: upstream takes every input's outline away (app.css), and the bar's title
     row would clip one drawn outside */
  .ws-person-bar-form :global(.ws-person-bar-field) {
    width: 20ch;
    max-width: 40ch;
    padding: 0.125rem 0.375rem;
    border: 0;
    border-radius: var(--ws-radius);
    background: color-mix(in oklab, var(--immich-ui-dark) 6%, transparent);
    box-shadow: inset 0 0 0 var(--ws-border) var(--ws-accent);
  }
  .ws-person-bar-form :global(.ws-person-bar-field::placeholder) {
    color: var(--immich-ui-muted);
  }
  /* the people whose names match float under the field like a context menu: the same sheet (94% of the ground, so its
     words hold over a bright photo, omarchy-world.css), rows washed in the accent under the pointer or the keys */
  .ws-person-matches {
    position: fixed;
    z-index: 60;
    max-width: 24rem;
    padding: 6px;
    background: color-mix(in oklab, var(--immich-ui-light) 94%, transparent);
    -webkit-backdrop-filter: blur(24px) saturate(1.4);
    backdrop-filter: blur(24px) saturate(1.4);
    border: 1px solid color-mix(in oklab, var(--immich-ui-dark) 12%, transparent);
    border-radius: var(--ws-radius);
    box-shadow:
      0 4px 12px -4px rgb(0 0 0 / 0.25),
      0 24px 48px -12px rgb(0 0 0 / 0.45);
  }
  .ws-person-matches-wait {
    display: flex;
    justify-content: center;
    padding: 0.5rem;
  }
  .ws-person-match {
    display: flex;
    width: 100%;
    align-items: center;
    gap: 0.6rem;
    padding: 0.3rem 0.55rem 0.3rem 0.3rem;
    border-radius: var(--ws-radius);
    font-size: var(--ws-text-ui);
    font-weight: 500;
    color: var(--immich-ui-dark);
    text-align: start;
    transition: background-color 90ms;
  }
  .ws-person-match:hover,
  .ws-person-match:focus-visible {
    background: color-mix(in oklab, var(--ws-accent) 18%, transparent);
    outline: none;
  }
  .ws-person-match img {
    flex: none;
    width: 1.75rem;
    height: 1.75rem;
    border-radius: 9999px;
    object-fit: cover;
  }
  .ws-person-match span {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
