<script lang="ts" generics="T">
  import LazyChunks from '$lib/gallery/components/lazy-chunks.svelte';
  import type { Snippet } from 'svelte';

  interface Props {
    items: T[];
    chunk: Snippet<[T[]]>;
    gridClass?: string;
  }

  let { items, chunk, gridClass = 'grid grid-auto-fill-56 gap-y-4' }: Props = $props();

  // An album-card grid (grid-auto-fill-56: 14rem tracks, no column gap) mounted in chunks of whole
  // rows, so a chunk never ends in a half-filled row.
  const remPx =
    typeof document === 'undefined'
      ? 16
      : Number(getComputedStyle(document.documentElement).fontSize.replace('px', '')) || 16;
  let width = $state(0);
  let columns = $state(1);
  let rowGap = $state('1rem');
  // bind:clientWidth reports asynchronously; read the width on mount too so the first chunks are
  // cut for the real column count rather than for one column.
  const measure = (element: HTMLElement) => {
    const update = () => {
      width = element.clientWidth;
      // Use the rendered grid: the local album layout has responsive tracks and desktop-controlled gaps.
      const grid = element.querySelector<HTMLElement>('[data-chunk]');
      const style = grid ? getComputedStyle(grid) : undefined;
      const tracks = style?.gridTemplateColumns;
      columns =
        tracks && tracks !== 'none' ? tracks.trim().split(/\s+/).length : Math.max(1, Math.floor(width / (14 * remPx)));
      rowGap = style?.rowGap && style.rowGap !== 'normal' ? style.rowGap : '1rem';
    };
    update();
    const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(update);
    observer?.observe(element);
    return { destroy: () => observer?.disconnect() };
  };
  // A card is its square cover plus ~6rem of padding, title and details.
  const estimateHeight = (count: number) => Math.ceil(count / columns) * (width / columns + 6 * remPx);
</script>

<div class="flex flex-col" style:gap={rowGap} use:measure>
  <LazyChunks {items} chunkSize={columns * 8} {estimateHeight} {chunk} class={gridClass} />
</div>
