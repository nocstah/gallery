<script lang="ts">
  import { clickOutside } from '$lib/actions/click-outside';
  import { languageManager } from '$lib/managers/language-manager.svelte';
  import type { Snippet } from 'svelte';

  interface Props {
    isVisible?: boolean;
    direction?: 'left' | 'right';
    x?: number;
    y?: number;
    id?: string | undefined;
    ariaLabel?: string | undefined;
    ariaLabelledBy?: string | undefined;
    ariaActiveDescendant?: string | undefined;
    menuScrollView?: HTMLDivElement | undefined;
    menuElement?: HTMLUListElement | undefined;
    onClose?: (() => void) | undefined;
    /** Local Omarchy layer: render at the end of <body>, above everything (the photo grid's right-click menu) */
    portal?: boolean;
    children?: Snippet;
  }

  let {
    isVisible = false,
    direction = 'right',
    x = 0,
    y = 0,
    id = undefined,
    ariaLabel = undefined,
    ariaLabelledBy = undefined,
    ariaActiveDescendant = undefined,
    menuScrollView = $bindable(),
    menuElement = $bindable(),
    onClose = undefined,
    portal = false,
    children,
  }: Props = $props();

  // Local Omarchy layer: the menu re-measures itself whenever it or its content changes size, so the placement below
  // always uses its real height (a header image loading, a row added); and it can move to <body>
  let measured = $state(0);
  const watchSize = (node: HTMLElement) => {
    const observer = new ResizeObserver(() => measured++);
    observer.observe(node);
    if (menuElement) {
      observer.observe(menuElement);
    }
    return { destroy: () => observer.disconnect() };
  };
  const toBody = (node: HTMLElement, enabled: boolean) => {
    if (enabled) {
      (document.fullscreenElement ?? document.body).append(node);
    }
    return { destroy: () => enabled && node.remove() };
  };

  const swap = (direction: string) => (direction === 'left' ? 'right' : 'left');

  const layoutDirection = $derived(languageManager.rtl ? swap(direction) : direction);
  const position = $derived.by(() => {
    if (!menuScrollView || !menuElement) {
      return { left: 0, top: 0 };
    }

    void measured;
    const rect = menuScrollView.getBoundingClientRect();
    const margin = 8;

    // Local Omarchy layer: the whole menu fits in the window. Its full height counts the frame (padding and border)
    // around the list, not the list alone; where it does not fit after the cursor it opens before it (above, or to the
    // other side), like a desktop menu, and only a menu taller than the window scrolls.
    const style = getComputedStyle(menuScrollView);
    // CSS lengths include px; Number('8px') would make the menu position NaN.
    /* eslint-disable unicorn/prefer-number-coercion */
    const frame =
      Number.parseFloat(style.paddingTop) +
      Number.parseFloat(style.paddingBottom) +
      Number.parseFloat(style.borderTopWidth) +
      Number.parseFloat(style.borderBottomWidth);
    /* eslint-enable unicorn/prefer-number-coercion */
    const height = menuElement.scrollHeight + frame;
    const width = rect.width;

    let start = layoutDirection === 'left' ? x - width : x;
    if (layoutDirection === 'right' && start + width > windowInnerWidth - margin && x - width >= margin) {
      start = x - width;
    } else if (layoutDirection === 'left' && start < margin && x + width <= windowInnerWidth - margin) {
      start = x;
    }
    const left = Math.max(margin, Math.min(windowInnerWidth - width - margin, start));

    let top = y;
    if (top + height > windowInnerHeight - margin && y - height >= margin) {
      top = y - height;
    }
    top = Math.max(margin, Math.min(windowInnerHeight - height - margin, top));
    const maxHeight = windowInnerHeight - top - margin;

    const needScrollBar = height > maxHeight;

    return { left, top, maxHeight, needScrollBar };
  });

  let windowInnerHeight: number = $state(0);
  let windowInnerWidth: number = $state(0);
</script>

<svelte:window bind:innerWidth={windowInnerWidth} bind:innerHeight={windowInnerHeight} />

<div
  bind:this={menuScrollView}
  class={[
    'fixed z-70 w-max max-w-75 min-w-50 immich-scrollbar rounded-lg bg-slate-100 shadow-lg duration-250 ease-in-out',
    position.needScrollBar ? 'overflow-auto' : 'overflow-hidden',
  ]}
  style:left="{position.left}px"
  style:z-index={portal ? 2_147_483_000 : undefined}
  style:visibility={isVisible && menuScrollView && menuElement ? undefined : 'hidden'}
  style:top="{position.top}px"
  style:max-height={isVisible ? `${position.maxHeight}px` : '0px'}
  style:transition-property="none"
  style:scrollbar-color="rgba(85, 86, 87, 0.408) transparent"
  use:clickOutside={{ onOutclick: onClose }}
  use:watchSize
  use:toBody={portal}
  data-menu-portal={portal ? true : undefined}
  inert={!isVisible}
  tabindex="-1"
>
  <ul
    {id}
    aria-activedescendant={ariaActiveDescendant ?? ''}
    aria-label={ariaLabel}
    aria-labelledby={ariaLabelledBy}
    bind:this={menuElement}
    class="flex flex-col outline-none"
    role="menu"
    tabindex="-1"
  >
    {@render children?.()}
  </ul>
</div>
