<script lang="ts">
  // Local Omarchy layer: a photo's small tile in the AI inbox (a kind's strip, a card's photos). A picture that shows
  // nothing, a video whose first frame is black (in "Mac albums you're missing", a 404 s clip that opens on black) or
  // a thumbnail Gallery could not make, is a quiet placeholder: the tile's own tint in its hairline with a muted mark,
  // rather than a black hole among the photos (utils/curator-inbox isBlankPicture). Only the tile changes; the photo
  // opens as it is. The tiles are decoration beside the words, so the placeholder is too; its tooltip says why.
  import { isBlankPicture } from '$lib/utils/curator-inbox';
  import { Icon } from '@immich/ui';
  import { mdiImageOffOutline } from '@mdi/js';
  import { t } from 'svelte-i18n';

  interface Props {
    src: string;
    /** the tile's side, as the strip draws it */
    size: number;
    /** degrees the picture is turned (a rotation's proposed view) */
    turn?: number;
    class?: string;
  }

  let { src, size, turn = 0, class: className = '' }: Props = $props();

  let blank = $state(false);
</script>

{#if blank}
  <span
    class="ws-strip-tile tile-blank {className}"
    style:--tile-size="{size}px"
    title={$t('ai_inbox_no_preview')}
    aria-hidden="true"
  >
    <Icon icon={mdiImageOffOutline} size="40%" />
  </span>
{:else}
  <img
    class="ws-strip-tile {className}"
    {src}
    alt=""
    loading="lazy"
    width={size}
    height={size}
    style:rotate={turn ? `${turn}deg` : undefined}
    onload={(event) => (blank = isBlankPicture(event.currentTarget as HTMLImageElement))}
    onerror={() => (blank = true)}
  />
{/if}

<style>
  .tile-blank {
    display: grid;
    place-items: center;
    width: var(--tile-size);
    height: var(--tile-size);
    color: var(--immich-ui-muted);
  }
</style>
