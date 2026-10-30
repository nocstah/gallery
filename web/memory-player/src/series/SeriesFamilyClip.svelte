<script lang="ts">
  // Local Omarchy layer: a clip from All photos on the family page (series), played whole with its sound in the
  // browser's own player (the film plays a clip muted, for a few seconds), on black over the grid. Close and Escape go
  // back to the grid.
  import { Icon } from '@immich/ui';
  import { mdiClose } from '@mdi/js';
  import { t } from 'svelte-i18n';

  type Props = {
    src: string;
    poster: string;
    onClose: () => void;
  };

  let { src, poster, onClose }: Props = $props();

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape' && !event.defaultPrevented) {
      event.preventDefault();
      onClose();
    }
  };
</script>

<svelte:document onkeydown={onKeyDown} />

<div class="family-clip" data-testid="series-family-clip">
  <button
    type="button"
    class="memory-icon-button family-clip-close"
    aria-label={$t('close')}
    title={$t('close')}
    onclick={onClose}
  >
    <Icon icon={mdiClose} size="24" aria-hidden />
  </button>
  <!-- the family's own clips have no captions to give -->
  <!-- svelte-ignore a11y_media_has_caption -->
  <video {src} {poster} aria-label={$t('video')} controls autoplay playsinline preload="auto"></video>
</div>

<style>
  .family-clip {
    position: fixed;
    inset: 0;
    z-index: 40;
    display: grid;
    place-items: center;
    background: #000;
    color: #fff;
  }
  .family-clip video {
    width: 100%;
    height: 100%;
    object-fit: contain;
  }
  .family-clip-close {
    position: absolute;
    top: max(0.75rem, env(safe-area-inset-top));
    left: max(0.75rem, env(safe-area-inset-left));
    z-index: 1;
    border-radius: var(--ws-radius);
    background: var(--ws-glass-strong);
  }
</style>
