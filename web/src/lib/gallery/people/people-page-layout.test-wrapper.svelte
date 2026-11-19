<script lang="ts">
  import { TooltipProvider } from '@immich/ui';
  import type { Snippet } from 'svelte';
  import type { HTMLAttributes } from 'svelte/elements';

  // The People page's scroll memory is an attachment on UserPageLayout (`{@attach scrollMemory(...)}`), which
  // reaches the layout as a rest prop; the scroll box takes it, as the real layout's does.
  interface Props extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
    title?: string;
    description?: string;
    leading?: Snippet;
    descriptionTrailing?: Snippet;
    buttons?: Snippet;
    children?: Snippet;
  }

  let { title, description, leading, descriptionTrailing, buttons, children, ...rest }: Props = $props();
</script>

<TooltipProvider>
  <div data-testid="user-page-layout" data-title={title} data-description={description}>
    {#if leading}<div data-testid="layout-leading">{@render leading()}</div>{/if}
    {#if descriptionTrailing}<div data-testid="layout-description-trailing">{@render descriptionTrailing()}</div>{/if}
    {#if buttons}<div data-testid="layout-buttons">{@render buttons()}</div>{/if}
    <div {...rest} data-testid="people-scroll">{@render children?.()}</div>
  </div>
</TooltipProvider>
