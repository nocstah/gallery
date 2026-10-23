<script lang="ts">
  import { useActions, type ActionArray } from '$lib/actions/use-actions';
  import { TooltipProvider } from '@immich/ui';
  import type { Snippet } from 'svelte';

  interface Props {
    title?: string;
    description?: string;
    leading?: Snippet;
    descriptionTrailing?: Snippet;
    buttons?: Snippet;
    children?: Snippet;
    use?: ActionArray;
  }

  let { title, description, leading, descriptionTrailing, buttons, children, use = [] }: Props = $props();
</script>

<TooltipProvider>
  <div data-testid="user-page-layout" data-title={title} data-description={description}>
    {#if leading}<div data-testid="layout-leading">{@render leading()}</div>{/if}
    {#if descriptionTrailing}<div data-testid="layout-description-trailing">{@render descriptionTrailing()}</div>{/if}
    {#if buttons}<div data-testid="layout-buttons">{@render buttons()}</div>{/if}
    <div data-testid="people-scroll" use:useActions={use}>{@render children?.()}</div>
  </div>
</TooltipProvider>
