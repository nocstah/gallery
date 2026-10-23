<script lang="ts">
  // Local Omarchy layer: what a suggestion is about, shown with the photos themselves. A cover change shows the
  // current cover beside the proposed one, a sharper face icon the icon now beside the face it would be cut from, a
  // name shows the face group beside photos it was found in, a merge shows
  // every face group being joined, a restored photo or clip shares one frame with its original, an album of people
  // seen together (a smart album Curator proposes) shows their faces before photos of them together. Each photo
  // opens in a zoomable inspector that keeps the review in place; modified clicks still open Gallery in a new tab. Resting the pointer on a photo
  // shows it large, whole, in the middle of the screen, until the pointer moves off it. A picture with nothing to show
  // is a quiet placeholder (InboxTile). Each photo, face and control is described by its card (`describedBy`: the
  // card's heading and line), so a screen reader hears whose preview it opens, and the inspector is titled as the
  // card is headed.
  import InboxTile from '$lib/components/curator/InboxTile.svelte';
  import InboxInspector from '$lib/components/curator/InboxInspector.svelte';
  import { inspectionItems } from '$lib/utils/inbox-inspection';
  import RestoreCompare from '$lib/components/curator/RestoreCompare.svelte';
  import { reelUrl, type Suggestion } from '$lib/utils/curator';
  import { getAssetMediaUrl } from '$lib/utils';
  import { AssetMediaSize } from '@immich/sdk';
  import { onDestroy } from 'svelte';
  import { t } from 'svelte-i18n';

  interface Props {
    suggestion: Suggestion;
    /** the card's heading, for the inspector's title (Curator's title by default) */
    title?: string;
    /** the ids of what names the card (its heading and line), for each photo and control */
    describedBy?: string;
  }

  let { suggestion, title, describedBy }: Props = $props();
  let inspecting = $state<number>();
  const inspectItems = $derived(inspectionItems(suggestion));
  const inspectPhoto = (id: string, turn = 0) => {
    inspecting = Math.max(
      0,
      inspectItems.findIndex((item) => item.assetId === id && (item.turn ?? 0) === turn),
    );
  };
  const inspectFace = (src: string) => {
    inspecting = Math.max(
      0,
      inspectItems.findIndex((item) => item.src === src),
    );
  };

  const thumbnail = (id: string) => getAssetMediaUrl({ id, size: AssetMediaSize.Thumbnail });
  const preview = (id: string) => getAssetMediaUrl({ id, size: AssetMediaSize.Preview });

  let peek = $state<{ id: string; turn: number }>();
  let peekTimer: ReturnType<typeof setTimeout> | undefined;
  const peekAt = (id: string, turn: number) => {
    clearTimeout(peekTimer);
    peekTimer = setTimeout(() => (peek = { id, turn }), 250);
  };
  const unpeek = () => {
    clearTimeout(peekTimer);
    peek = undefined;
  };
  onDestroy(unpeek);
  const face = (personId: string) => `/api/people/${personId}/thumbnail`;

  const payload = $derived(suggestion.payload as Record<string, unknown>);
  const photos = $derived([...new Set(suggestion.asset_ids)]);
  const rotation = $derived(Number(payload.rotation ?? payload.angle ?? 0));
  const faces = $derived(
    suggestion.kind === 'person.merge'
      ? [String(payload.into_id), ...((payload.ids as string[] | undefined) ?? [])]
      : [suggestion.target_id],
  );
  /** the people an album of people together is about, in the order its name gives them */
  const together = $derived(
    suggestion.kind === 'smart.create' ? ((payload.person_ids as string[] | undefined) ?? []) : [],
  );
</script>

{#snippet photo(id: string, size: number, label?: string, turn = 0)}
  <a
    class="visual-tile"
    href="/photos/{id}"
    target="_blank"
    rel="noopener"
    style:width="{size}px"
    aria-label={label ? `${label}: ${$t('ai_inbox_inspect')}` : $t('ai_inbox_inspect')}
    aria-describedby={describedBy}
    onmouseenter={() => peekAt(id, turn)}
    onmouseleave={unpeek}
    onclick={(event) => {
      if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) {
        return;
      }
      event.preventDefault();
      unpeek();
      inspectPhoto(id, turn);
    }}
    title={$t('ai_inbox_inspect')}
  >
    <InboxTile src={thumbnail(id)} {size} {turn} />
    {#if label}
      <span class="ws-inbox-meta">{label}</span>
    {/if}
  </a>
{/snippet}

<svelte:window onscroll={unpeek} onkeydown={unpeek} />

{#if peek}
  <div class="visual-peek" aria-hidden="true">
    <img src={preview(peek.id)} alt="" style:rotate={peek.turn ? `${peek.turn}deg` : undefined} />
  </div>
{/if}

<div class="ws-strip visual">
  {#if suggestion.kind === 'reel.publish' && suggestion.status === 'pending'}
    <!-- the reel itself, watched before it goes into Gallery; its poster is the opening photo -->
    <div class="visual-video">
      <!-- svelte-ignore a11y_media_has_caption -->
      <video
        class="visual-reel"
        src={reelUrl(suggestion.id)}
        poster={photos[0] ? thumbnail(photos[0]) : undefined}
        controls
        preload="none"
        playsinline
      ></video><button
        type="button"
        class="ws-btn-quiet"
        aria-describedby={describedBy}
        onclick={(event) => {
          event.currentTarget.parentElement?.querySelector('video')?.pause();
          inspecting = 0;
        }}>{$t('ai_inbox_inspect')}</button
      >
    </div>
  {:else if suggestion.kind === 'restore.publish' && suggestion.status === 'pending'}
    <!-- the original and the restored version in one frame, a divider between them -->
    <RestoreCompare
      {suggestion}
      size="card"
      {describedBy}
      onInspect={() => {
        unpeek();
        inspecting = 0;
      }}
    />
  {:else if suggestion.kind === 'stack.cover' && suggestion.asset_ids.length > 1}
    {@render photo(suggestion.asset_ids[1], 112, $t('ai_inbox_now'))}
    {@render photo(suggestion.asset_ids[0], 112, $t('ai_inbox_proposed'))}
  {:else if suggestion.kind === 'asset.rotate' && suggestion.asset_ids.length > 0}
    {@render photo(suggestion.asset_ids[0], 112, $t('ai_inbox_now'))}
    {@render photo(suggestion.asset_ids[0], 112, $t('ai_inbox_proposed'), rotation)}
  {:else if suggestion.kind === 'person.portrait'}
    <!-- the person's icon now beside the face it would be cut from next (Gallery's exact face crop) -->
    <button
      type="button"
      class="visual-tile"
      style:width="112px"
      aria-label={`${$t('ai_inbox_now')}: ${$t('ai_inbox_inspect')}`}
      aria-describedby={describedBy}
      onclick={() => inspectFace(face(suggestion.target_id))}
    >
      <img class="ws-strip-tile visual-face" src={face(suggestion.target_id)} alt="" width="112" height="112" />
      <span class="ws-inbox-meta">{$t('ai_inbox_now')}</span>
    </button>
    <button
      type="button"
      class="visual-tile"
      style:width="112px"
      aria-label={`${$t('ai_inbox_proposed')}: ${$t('ai_inbox_inspect')}`}
      aria-describedby={describedBy}
      onclick={() => inspectFace(`/api/people/${suggestion.target_id}/faces/${payload.face_id}/thumbnail`)}
    >
      <img
        class="ws-strip-tile visual-face"
        src="/api/people/{suggestion.target_id}/faces/{payload.face_id}/thumbnail"
        alt=""
        width="112"
        height="112"
      />
      <span class="ws-inbox-meta">{$t('ai_inbox_proposed')}</span>
    </button>
  {:else if ['person.name', 'person.merge', 'person.hide'].includes(suggestion.kind)}
    {#each [...new Set(faces)] as personId (personId)}
      <button
        type="button"
        class="visual-tile"
        aria-label={$t('ai_inbox_inspect')}
        aria-describedby={describedBy}
        onclick={() => inspectFace(face(personId))}
        ><img
          class="ws-strip-tile visual-face"
          src={face(personId)}
          alt=""
          loading="lazy"
          width="72"
          height="72"
        /></button
      >
    {/each}
    {#if suggestion.kind === 'person.name' || suggestion.kind === 'person.hide'}
      {#each photos.slice(0, 4) as id (id)}
        {@render photo(id, 72)}
      {/each}
    {/if}
  {:else if together.length > 0}
    {#each together as personId (personId)}
      <button
        type="button"
        class="visual-tile"
        aria-label={$t('ai_inbox_inspect')}
        aria-describedby={describedBy}
        onclick={() => inspectFace(face(personId))}
        ><img
          class="ws-strip-tile visual-face"
          src={face(personId)}
          alt=""
          loading="lazy"
          width="72"
          height="72"
        /></button
      >
    {/each}
    {#each photos.slice(0, 4) as id (id)}
      {@render photo(id, 72)}
    {/each}
  {:else if ['asset.archive', 'asset.tag', 'asset.lock'].includes(suggestion.kind) && suggestion.asset_ids.length > 0}
    {@render photo(suggestion.asset_ids[0], 112)}
  {:else}
    {#each photos.slice(0, 6) as id (id)}
      {@render photo(id, 72)}
    {/each}
  {/if}
</div>

{#if inspecting !== undefined && inspectItems.length > 0}
  <InboxInspector
    items={inspectItems}
    initialIndex={inspecting}
    title={title ?? suggestion.title}
    onClose={() => (inspecting = undefined)}
  />
{/if}

<style>
  .visual-video {
    display: grid;
    gap: 0.25rem;
  }
  .visual-tile {
    cursor: zoom-in;
  }
  .visual {
    align-items: flex-start;
  }
  .visual-tile {
    display: grid;
    gap: 0.3rem;
    flex: none;
  }
  .visual-tile:focus-visible {
    outline: var(--ws-border) solid var(--ws-accent);
    outline-offset: 3px;
    border-radius: var(--ws-radius);
  }
  .visual-tile :global(.ws-strip-tile) {
    width: 100%;
    height: auto;
    aspect-ratio: 1;
    transition: rotate 240ms cubic-bezier(0.22, 1, 0.36, 1);
  }
  .visual-tile:hover :global(.ws-strip-tile) {
    outline: var(--ws-border) solid var(--ws-accent);
    outline-offset: calc(var(--ws-border) * -1);
  }
  /* a fixed width: a percentage here would size the grid's auto column from the video's own 1920 px */
  .visual-reel {
    width: 26rem;
    max-width: 100%;
    aspect-ratio: 16 / 9;
    border-radius: var(--ws-radius);
    outline: 1px solid var(--ws-hairline);
    outline-offset: -1px;
    background: #000;
  }
  /* the photo large and whole, over the list; the pointer passes through it, so moving off the tile ends it */
  .visual-peek {
    position: fixed;
    inset: 0;
    z-index: 60;
    display: grid;
    place-items: center;
    pointer-events: none;
  }
  .visual-peek img {
    max-width: min(90vw, 1600px);
    max-height: 88vh;
    object-fit: contain;
    border-radius: var(--ws-radius);
    box-shadow: 0 1.5rem 4rem rgb(0 0 0 / 45%);
    background: var(--ws-surface, #000);
  }
  /* faces are people, not photos: drawn round like everywhere else Gallery shows a person */
  .visual-face {
    border-radius: 999px;
  }
  @media (prefers-reduced-motion: reduce) {
    .visual-tile :global(.ws-strip-tile) {
      transition: none;
    }
  }
</style>
