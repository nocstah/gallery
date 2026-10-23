<script lang="ts">
  // Local Omarchy layer: one suggestion, large, for review mode. Each kind shows what the decision is about at the
  // size it needs: two covers side by side, a photo before and after its turn, a face beside the photos it was named
  // from, copies next to each other, an album's spread of photos, the reel itself, a restored version over its
  // original. Each piece of evidence opens in the zoomable inspector.
  import InboxInspector from '$lib/components/curator/InboxInspector.svelte';
  import { inspectionItems } from '$lib/utils/inbox-inspection';
  import RestoreCompare from '$lib/components/curator/RestoreCompare.svelte';
  import { getAssetMediaUrl } from '$lib/utils';
  import { reelUrl, type Suggestion } from '$lib/utils/curator';
  import { AssetMediaSize } from '@immich/sdk';
  import { t } from 'svelte-i18n';

  interface Props {
    suggestion: Suggestion;
  }

  let { suggestion }: Props = $props();
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

  const preview = (id: string) => getAssetMediaUrl({ id, size: AssetMediaSize.Preview });
  const thumbnail = (id: string) => getAssetMediaUrl({ id, size: AssetMediaSize.Thumbnail });
  const face = (personId: string) => `/api/people/${personId}/thumbnail`;

  const payload = $derived(suggestion.payload as Record<string, unknown>);
  const photos = $derived([...new Set(suggestion.asset_ids)]);
  /** an album's or a tag's whole set, spread evenly, so the grid shows its range rather than its first day */
  const spread = $derived.by(() => {
    const all = [...new Set((payload.asset_ids as string[] | undefined) ?? photos)];
    const step = Math.max(1, Math.floor(all.length / 12));
    return all.filter((_, index) => index % step === 0).slice(0, 12);
  });
  const faces = $derived(
    suggestion.kind === 'person.merge'
      ? [String(payload.into_id), ...((payload.ids as string[] | undefined) ?? [])]
      : [suggestion.target_id],
  );
  const rotation = $derived(Number(payload.rotation ?? payload.angle ?? 0));
</script>

{#snippet big(id: string, label?: string, turn = 0)}
  <button
    type="button"
    class="stage-big"
    aria-label={label ? `${label}: ${$t('ai_inbox_inspect')}` : $t('ai_inbox_inspect')}
    onclick={() => inspectPhoto(id, turn)}
  >
    <img src={preview(id)} alt="" style:rotate={turn ? `${turn}deg` : undefined} />
    {#if label}
      <span class="ws-inbox-meta">{label}</span>
    {/if}
  </button>
{/snippet}

{#snippet grid(ids: string[])}
  <div class="stage-grid">
    {#each ids as id (id)}
      <button type="button" aria-label={$t('ai_inbox_inspect')} onclick={() => inspectPhoto(id)}
        ><img src={thumbnail(id)} alt="" /></button
      >
    {/each}
  </div>
{/snippet}

<div class="stage" data-kind={suggestion.kind}>
  {#if suggestion.kind === 'reel.publish' && suggestion.status === 'pending'}
    <!-- svelte-ignore a11y_media_has_caption -->
    <div class="stage-reel-wrap">
      <video class="stage-reel" src={reelUrl(suggestion.id)} controls preload="metadata" playsinline></video><button
        type="button"
        class="ws-btn-quiet"
        onclick={(event) => {
          event.currentTarget.parentElement?.querySelector('video')?.pause();
          inspecting = 0;
        }}>{$t('ai_inbox_inspect')}</button
      >
    </div>
  {:else if suggestion.kind === 'restore.publish' && suggestion.status === 'pending'}
    <RestoreCompare {suggestion} size="stage" onInspect={() => (inspecting = 0)} />
  {:else if suggestion.kind === 'stack.cover' && photos.length > 1}
    <div class="stage-pair">
      {@render big(suggestion.asset_ids[1], $t('ai_inbox_now'))}
      {@render big(suggestion.asset_ids[0], $t('ai_inbox_proposed'))}
    </div>
  {:else if suggestion.kind === 'asset.rotate' && photos.length > 0}
    <div class="stage-pair">
      {@render big(photos[0], $t('ai_inbox_now'))}
      {@render big(photos[0], $t('ai_inbox_proposed'), rotation)}
    </div>
  {:else if suggestion.kind === 'stack.create' && photos.length > 1}
    <div class="stage-pair">
      {#each photos.slice(0, 3) as id (id)}
        {@render big(id)}
      {/each}
    </div>
  {:else if suggestion.kind === 'person.portrait'}
    <div class="stage-pair">
      {#each inspectItems.slice(0, 2) as item (item.src)}
        <button
          type="button"
          class="stage-big"
          aria-label={`${$t(item.label!)}: ${$t('ai_inbox_inspect')}`}
          onclick={() => inspectFace(item.src!)}
          ><img src={item.src} alt="" /><span class="ws-inbox-meta">{$t(item.label!)}</span></button
        >
      {/each}
    </div>
  {:else if ['person.name', 'person.merge', 'person.hide'].includes(suggestion.kind)}
    <div class="stage-people">
      <div class="stage-faces">
        {#each [...new Set(faces)] as personId (personId)}
          <button type="button" aria-label={$t('ai_inbox_inspect')} onclick={() => inspectFace(face(personId))}
            ><img class="stage-face" src={face(personId)} alt="" /></button
          >
        {/each}
      </div>
      {#if photos.length > 0}
        {@render grid(photos.slice(0, 8))}
      {/if}
    </div>
  {:else if ['asset.archive', 'asset.describe', 'asset.tag', 'asset.lock'].includes(suggestion.kind) && photos.length > 0}
    <div class="stage-single">{@render big(photos[0])}</div>
  {:else}
    {@render grid(spread)}
  {/if}
</div>

{#if inspecting !== undefined && inspectItems.length > 0}
  <InboxInspector
    items={inspectItems}
    initialIndex={inspecting}
    title={suggestion.title}
    onClose={() => (inspecting = undefined)}
  />
{/if}

<style>
  .stage-reel-wrap {
    display: grid;
    grid-template-rows: minmax(0, 1fr) auto;
    justify-items: center;
    max-height: 100%;
  }
  .stage button {
    cursor: zoom-in;
  }
  .stage {
    display: grid;
    place-items: center;
    width: 100%;
    height: 100%;
    min-height: 0;
  }
  .stage-pair {
    display: grid;
    grid-auto-flow: column;
    grid-auto-columns: minmax(0, 1fr);
    gap: calc(var(--ws-gap) * 1.5);
    width: 100%;
    height: 100%;
    min-height: 0;
  }
  .stage-big {
    display: grid;
    grid-template-rows: minmax(0, 1fr) auto;
    justify-items: center;
    gap: 0.5rem;
    min-height: 0;
    border-radius: var(--ws-radius);
  }
  .stage-big img {
    max-width: 100%;
    max-height: 100%;
    min-height: 0;
    object-fit: contain;
    border-radius: var(--ws-radius);
    transition: rotate 240ms cubic-bezier(0.22, 1, 0.36, 1);
  }
  .stage-big:focus-visible {
    outline: var(--ws-border) solid var(--ws-accent);
    outline-offset: 3px;
  }
  .stage-single {
    height: 100%;
    min-height: 0;
    width: 100%;
  }
  .stage-single .stage-big {
    height: 100%;
  }
  .stage-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(14rem, 45%), 1fr));
    gap: var(--ws-gap);
    width: 100%;
    max-height: 100%;
    overflow: auto;
    align-content: start;
  }
  .stage-grid img {
    width: 100%;
    aspect-ratio: 1;
    object-fit: cover;
    border-radius: var(--ws-radius);
    outline: 1px solid var(--ws-hairline);
    outline-offset: -1px;
  }
  .stage-grid button:hover img,
  .stage-grid button:focus-visible img {
    outline: var(--ws-border) solid var(--ws-accent);
    outline-offset: calc(var(--ws-border) * -1);
  }
  .stage-people {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    gap: calc(var(--ws-gap) * 2);
    align-items: start;
    width: 100%;
    max-height: 100%;
    overflow: auto;
  }
  .stage-faces {
    display: grid;
    gap: var(--ws-gap);
  }
  /* faces are people, not photos: round, as everywhere else Gallery shows a person */
  .stage-face {
    width: 10rem;
    height: 10rem;
    border-radius: 999px;
    object-fit: cover;
    outline: 1px solid var(--ws-hairline);
    outline-offset: -1px;
  }
  .stage-reel {
    max-width: 100%;
    max-height: 100%;
    aspect-ratio: 16 / 9;
    border-radius: var(--ws-radius);
    background: #000;
  }
  @media (max-width: 767px) {
    .stage-pair {
      grid-auto-flow: row;
      grid-auto-rows: minmax(0, 1fr);
    }
    .stage-people {
      grid-template-columns: minmax(0, 1fr);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .stage-big img {
      transition: none;
    }
  }
</style>
