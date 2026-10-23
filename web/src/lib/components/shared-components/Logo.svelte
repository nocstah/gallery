<script lang="ts">
  import { Theme, themeManager } from '@immich/ui';

  type Props = {
    variant?: 'icon' | 'inline' | 'stacked';
    size?: 'tiny' | 'small' | 'medium' | 'large' | 'giant';
    transparent?: boolean;
    // Local Omarchy layer: the logo in two layers in one box, so the bar's mark takes each theme's ink where the mark
    // is ink and keeps its own colour where it has one: the variant's ink file is a mask over the surrounding text's
    // colour, its colour file an image on top (icon: gallery-logo-mark-ink/-colour, inline: gallery-logo-inline-ink/
    // -colour). The committed ink files are the light logo and the colour files empty, so an unbranded build draws the
    // mark as before; a brand ships its own (branding/kioku). Decorative: the link around it carries the name.
    ink?: boolean;
    class?: string;
  };

  const { variant = 'icon', size = 'medium', transparent = false, ink = false, class: className }: Props = $props();

  const sizeClasses: Record<string, string> = {
    tiny: 'h-8',
    small: 'h-10',
    medium: 'h-12',
    large: 'h-16',
    giant: 'h-24',
  };

  const variantClasses: Record<string, string> = {
    icon: 'aspect-square',
    inline: '',
    stacked: '',
  };

  const src = $derived.by(() => {
    switch (variant) {
      case 'stacked': {
        return themeManager.value === Theme.Light ? '/gallery-logo-stacked.svg' : '/gallery-logo-stacked-dark.svg';
      }
      case 'inline': {
        return themeManager.value === Theme.Light ? '/gallery-logo-inline-light.svg' : '/gallery-logo-inline-dark.svg';
      }
      default: {
        if (transparent) {
          return themeManager.value === Theme.Light ? '/gallery-loader.svg' : '/gallery-loader-dark.svg';
        }
        return themeManager.value === Theme.Light ? '/gallery-logo-mark.svg' : '/gallery-logo-mark-dark.svg';
      }
    }
  });

  const classes = $derived([sizeClasses[size], variantClasses[variant], className].filter(Boolean).join(' '));

  // the ink mode's layers; stacked has none of its own, so its whole file is the mask, with no colour on top
  const layers = $derived.by(() => {
    switch (variant) {
      case 'inline': {
        return { ink: '/gallery-logo-inline-ink.svg', colour: '/gallery-logo-inline-colour.svg' };
      }
      case 'stacked': {
        return { ink: src, colour: undefined };
      }
      default: {
        return { ink: '/gallery-logo-mark-ink.svg', colour: '/gallery-logo-mark-colour.svg' };
      }
    }
  });
</script>

{#if ink}
  <!-- the hidden image gives the box its width at the logo's own proportions; the ink layer and the colour layer fill
       it, the colour over the ink and outside its mask -->
  <span class="ws-logo-ink {classes}" aria-hidden="true">
    <span class="ws-logo-ink-mask" style:--ws-logo-src="url({layers.ink})"></span>
    {#if layers.colour}
      <img src={layers.colour} alt="" class="ws-logo-ink-colour" />
    {/if}
    <img src={layers.ink} alt="" class="ws-logo-ink-size" />
  </span>
{:else}
  <img {src} class={classes} alt="Gallery logo" />
{/if}

<style>
  .ws-logo-ink {
    position: relative;
    display: inline-flex;
  }
  .ws-logo-ink-mask {
    position: absolute;
    inset: 0;
    background-color: currentColor;
    -webkit-mask: var(--ws-logo-src) center / contain no-repeat;
    mask: var(--ws-logo-src) center / contain no-repeat;
  }
  .ws-logo-ink-colour {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: contain;
  }
  .ws-logo-ink-size {
    height: 100%;
    width: auto;
    visibility: hidden;
  }
</style>
