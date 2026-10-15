<script lang="ts">
  // Local Omarchy layer: the album page renders the shell (UserPageLayout) since it moved into it; these specs exercise
  // the page's own logic, so the shell is a plain frame that renders what the page hands it
  import type { Snippet } from 'svelte';

  type Props = {
    hideNavbar?: boolean;
    barFitsNavbar?: boolean;
    scrollbar?: boolean;
    title?: string;
    description?: string;
    leading?: Snippet;
    buttons?: Snippet;
    children?: Snippet;
  };

  const { title, description, leading, buttons, children }: Props = $props();
</script>

<header data-testid="mock-page-bar">
  {@render leading?.()}
  {#if title}<span data-testid="page-header">{title}</span>{/if}
  {#if description}<span data-testid="page-header-description">{description}</span>{/if}
  {@render buttons?.()}
</header>
<main>
  {@render children?.()}
</main>
