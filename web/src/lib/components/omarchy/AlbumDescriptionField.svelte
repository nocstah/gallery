<script lang="ts">
  // Local Omarchy layer: an album's description in its details: upstream's AlbumDescription, the field for whoever may
  // edit the album (its owner or an editor: services/album.service isAlbumEditor) and the words alone for everyone
  // else, so a viewer never sees "Add a description". On a phone (below 640px) an editor's album without a description
  // shows one quiet line instead of the empty field, "+ Add a description" in muted meta type, which opens the field;
  // left empty, the field goes back to the line (DESIGN.md, Album page).
  import AlbumDescription from '$lib/components/album-page/AlbumDescription.svelte';
  import { mediaQueryManager } from '$lib/stores/media-query-manager.svelte';
  import { Icon } from '@immich/ui';
  import { mdiPlus } from '@mdi/js';
  import { flushSync } from 'svelte';
  import { t } from 'svelte-i18n';

  type Props = {
    id: string;
    description: string;
    isEditor: boolean;
  };

  let { id, description = $bindable(), isEditor }: Props = $props();

  let writing = $state(false);
  let field = $state<HTMLElement>();
  const quiet = $derived(isEditor && !description && !writing && mediaQueryManager.isPhone);

  // the field is drawn and focused within the tap itself, so a phone opens its keyboard
  const write = () => {
    writing = true;
    flushSync();
    field?.querySelector('textarea')?.focus();
  };
  const onFocusOut = (event: FocusEvent) => {
    if (!description && !field?.contains(event.relatedTarget as Node | null)) {
      writing = false;
    }
  };
</script>

{#if quiet}
  <button type="button" class="ws-album-describe" onclick={write} data-testid="album-describe">
    <Icon icon={mdiPlus} size="16" aria-hidden={true} />
    {$t('add_a_description')}
  </button>
{:else}
  <div bind:this={field} onfocusout={onFocusOut}>
    <AlbumDescription {id} {isEditor} bind:description />
  </div>
{/if}

<style>
  /* one quiet line, as tall as a 24px target, that a finger finds a little past its edges; it keeps the room the field
     kept under itself (the ghost field's 0.5rem), so what follows it (an album's faces, a Space album's photos) stands
     where it stood from the field */
  .ws-album-describe {
    position: relative;
    display: flex;
    width: fit-content;
    align-items: center;
    gap: 0.375rem;
    min-height: 1.5rem;
    margin-block-end: 0.5rem;
    font-size: var(--ws-text-meta);
    font-weight: 500;
    color: var(--immich-ui-muted);
    transition: color 120ms;
  }
  .ws-album-describe::before {
    content: '';
    position: absolute;
    inset: -0.25rem -0.25rem;
  }
  .ws-album-describe:hover {
    color: var(--immich-ui-dark);
  }
  .ws-album-describe:focus-visible {
    outline: var(--ws-border) solid var(--ws-accent);
    outline-offset: 2px;
  }
</style>
