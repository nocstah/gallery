<script lang="ts">
  import type { ActiveItem } from '$lib/managers/global-search-manager.svelte';
  import PhotoPreview from './previews/photo-preview.svelte';
  import PersonPreview from './previews/person-preview.svelte';
  import PlacePreview from './previews/place-preview.svelte';
  import TagPreview from './previews/tag-preview.svelte';
  import AlbumPreview from './previews/album-preview.svelte';
  import SpacePreview from './previews/space-preview.svelte';
  import { fade } from 'svelte/transition';
  import { t } from 'svelte-i18n';

  interface Props {
    activeItem: ActiveItem | null;
  }
  let { activeItem }: Props = $props();

  // Key on kind (not id) so type changes cross-fade at 120 ms per design § Motion.
  // Same-kind different-item transitions inside the per-type previews rely on their own
  // 300 ms dwell + generation-counter staleness handling rather than cross-fade.
  const previewKey = $derived(activeItem?.kind ?? 'none');
</script>

{#snippet nothing()}
  <div class="flex h-full min-h-[360px] items-center justify-center px-8 text-center">
    <span class="text-sm text-muted">{$t('cmdk_nothing_to_preview')}</span>
  </div>
{/snippet}

{#key previewKey}
  <div in:fade={{ duration: 120 }}>
    {#if activeItem === null}
      <!-- Local Omarchy layer: one quiet line where upstream drew a giant faded logo; the palette shows this pane only
           while its list holds something to preview (global-search.svelte, showPreview) -->
      {@render nothing()}
    {:else if activeItem.kind === 'photo'}
      <PhotoPreview photo={activeItem.data as never} />
    {:else if activeItem.kind === 'person'}
      <PersonPreview person={activeItem.data as never} />
    {:else if activeItem.kind === 'place'}
      <PlacePreview place={activeItem.data as never} />
    {:else if activeItem.kind === 'tag'}
      <TagPreview tag={activeItem.data as never} />
    {:else if activeItem.kind === 'album'}
      <AlbumPreview item={activeItem.data as never} />
    {:else if activeItem.kind === 'space'}
      <SpacePreview item={activeItem.data as never} />
    {:else if activeItem.kind === 'nav'}
      <!-- Nav items have nothing richer than the row itself to show. Render the same
           empty-state placeholder so the pane stays the same width and doesn't
           flash a blank frame when the user cursors over a `>` nav result. -->
      {@render nothing()}
    {:else if activeItem.kind === 'command'}
      <!-- Commands are verbs, not destinations — there's nothing richer than the row
           itself to show. Render the same empty-state placeholder so the pane stays
           the same width and doesn't flash a blank frame when the user cursors over
           a command result. -->
      {@render nothing()}
    {/if}
  </div>
{/key}
