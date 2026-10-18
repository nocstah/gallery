<script lang="ts">
  import { getTabbable } from '$lib/utils/focus-util';
  import { Button } from '@immich/ui';
  import { t } from 'svelte-i18n';

  interface Props {
    /**
     * Target for the skip link to move focus to.
     */
    target?: string;
    /**
     * Text for the skip link button.
     */
    text?: string;
    /**
     * Breakpoint at which the skip link is visible. Defaults to always being visible.
     */
    breakpoint?: 'sm' | 'md' | 'lg' | 'xl' | '2xl';
    /**
     * Local Omarchy layer: lands the focus itself (the bar's: on the page's photo grid, utils/skip-to-content), true
     * when it did; otherwise the focus goes to the first control of the target
     */
    onSkip?: () => boolean;
  }

  let { target = 'main', text = $t('skip_to_content'), breakpoint, onSkip }: Props = $props();

  let isFocused = $state(false);

  const moveFocus = () => {
    if (onSkip?.()) {
      return;
    }
    const targetEl = document.querySelector<HTMLElement>(target);
    if (targetEl) {
      const element = getTabbable(targetEl)[0];
      if (element) {
        element.focus();
      }
    }
  };

  const getBreakpoint = () => {
    if (!breakpoint) {
      return '';
    }
    switch (breakpoint) {
      case 'sm': {
        return 'hidden sm:block';
      }
      case 'md': {
        return 'hidden md:block';
      }
      case 'lg': {
        return 'hidden lg:block';
      }
      case 'xl': {
        return 'hidden xl:block';
      }
      case '2xl': {
        return 'hidden 2xl:block';
      }
    }
  };
</script>

<div class="absolute inset-s-2 top-2 transition-transform {isFocused ? 'translate-y-0' : 'sr-only -translate-y-10'}">
  <Button
    size="small"
    onclick={moveFocus}
    class={getBreakpoint()}
    onfocus={() => (isFocused = true)}
    onblur={() => (isFocused = false)}
  >
    {text}
  </Button>
</div>
