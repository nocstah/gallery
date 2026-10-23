<script lang="ts">
  import { Theme, themeManager } from '@immich/ui';

  type Props = {
    variant?: 'icon' | 'inline' | 'stacked';
    size?: 'tiny' | 'small' | 'medium' | 'large' | 'giant';
    transparent?: boolean;
    // Local Omarchy layer: drawn in the surrounding text's colour, the logo file used only as a mask, so the bar's mark
    // takes each theme's ink instead of the file's fixed ink or paper. Decorative: the link around it carries the name.
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
</script>

{#if ink}
  <!-- the hidden image gives the mask its width at the logo's own proportions -->
  <span class="ws-logo-ink {classes}" style:--ws-logo-src="url({src})" aria-hidden="true">
    <img {src} alt="" class="ws-logo-ink-size" />
  </span>
{:else}
  <img {src} class={classes} alt="Gallery logo" />
{/if}

<style>
  .ws-logo-ink {
    display: inline-flex;
    background-color: currentColor;
    -webkit-mask: var(--ws-logo-src) center / contain no-repeat;
    mask: var(--ws-logo-src) center / contain no-repeat;
  }
  .ws-logo-ink-size {
    height: 100%;
    width: auto;
    visibility: hidden;
  }
</style>
