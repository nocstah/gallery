<script lang="ts">
  // Local Omarchy layer: an album's name in the one bar, in the bar's heading face (the album page lives in the shell
  // since 2026-10-15). An editor renames it in place: a click makes it a field, Enter or leaving it saves, Escape keeps
  // the old name.
  import { eventManager } from '$lib/managers/event-manager.svelte';
  import { handleError } from '$lib/utils/handle-error';
  import { updateAlbumInfo, type AlbumResponseDto } from '@immich/sdk';
  import { tick } from 'svelte';
  import { t } from 'svelte-i18n';

  type Props = {
    album: AlbumResponseDto;
    isEditor: boolean;
    onUpdate: (albumName: string) => void;
  };

  const { album, isEditor, onUpdate }: Props = $props();

  let editing = $state(false);
  let draft = $state('');
  let field = $state<HTMLInputElement>();

  const edit = async () => {
    draft = album.albumName;
    editing = true;
    await tick();
    field?.select();
  };

  const save = async () => {
    if (!editing) {
      return;
    }
    editing = false;
    const albumName = draft.replaceAll('\n', ' ').trim();
    if (!albumName || albumName === album.albumName) {
      return;
    }
    try {
      const response = await updateAlbumInfo({ id: album.id, updateAlbumDto: { albumName } });
      eventManager.emit('AlbumUpdate', response);
      onUpdate(response.albumName);
    } catch (error) {
      handleError(error, $t('errors.unable_to_save_album'));
    }
  };

  const onKeydown = (event: KeyboardEvent) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      field?.blur();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      editing = false;
    }
  };
</script>

{#if editing}
  <input
    bind:this={field}
    bind:value={draft}
    class="ws-album-bar-title ws-album-bar-field"
    aria-label={$t('rename')}
    size={Math.max(4, draft.length)}
    onblur={save}
    onkeydown={onKeydown}
  />
{:else if isEditor}
  <button type="button" class="ws-album-bar-title ws-album-bar-rename" title={$t('rename')} onclick={edit}>
    {album.albumName}
  </button>
{:else}
  <div class="ws-album-bar-title">{album.albumName}</div>
{/if}

<style>
  /* the bar's heading role, as UserPageLayout sets a page's title */
  /* the name gives way last: the dates ellipsize first, then the name, never below a few letters */
  .ws-album-bar-title {
    flex: 0 1 auto;
    min-width: 5ch;
    max-width: 32ch;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-family: var(--font-display);
    font-size: var(--ws-text-bar);
    font-weight: 750;
    font-stretch: 75%;
    line-height: 1.15;
    letter-spacing: -0.01em;
    word-spacing: 0.06em;
    color: var(--immich-ui-dark);
  }
  /* no negative margins: the bar's fitting reads them as the name overflowing its room */
  .ws-album-bar-rename {
    padding: 0.125rem 0.25rem;
    border-radius: var(--ws-radius);
    text-align: start;
    cursor: text;
  }
  .ws-album-bar-rename:hover {
    background: color-mix(in oklab, var(--immich-ui-dark) 6%, transparent);
  }
  /* focus rings are drawn inside, the name's and the field's: upstream takes every input's outline away (app.css), and
     the bar's title row would clip one drawn outside */
  .ws-album-bar-rename:focus-visible {
    outline: none;
    box-shadow: inset 0 0 0 var(--ws-border) var(--ws-accent);
  }
  .ws-album-bar-field {
    max-width: 40ch;
    padding: 0.125rem 0.25rem;
    border: 0;
    border-radius: var(--ws-radius);
    background: color-mix(in oklab, var(--immich-ui-dark) 6%, transparent);
    box-shadow: inset 0 0 0 var(--ws-border) var(--ws-accent);
  }
</style>
