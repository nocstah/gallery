<script lang="ts">
  import { TooltipProvider } from '@immich/ui';
  import type { ComponentProps } from 'svelte';
  import SpaceHero from './space-hero.svelte';

  // SpaceHero's own props, forwarded verbatim, so the wrapper cannot fall behind them (it had lost assetCount)
  let props: ComponentProps<typeof SpaceHero> = $props();
</script>

<TooltipProvider>
  <SpaceHero {...props} />
</TooltipProvider>
