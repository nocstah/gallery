<script lang="ts">
  // Local Omarchy layer: one series of From the beginning, its Coming up and its family page, all of it in the fork
  // module (gallery/series); another series' address is another page
  import SeriesPage from '$lib/gallery/series/SeriesPage.svelte';
  import type { PageData } from './$types';

  type Props = { data: PageData };

  let { data }: Props = $props();
</script>

{#key data.seriesId}
  <SeriesPage title={data.meta.title} seriesId={data.seriesId} />
{/key}
