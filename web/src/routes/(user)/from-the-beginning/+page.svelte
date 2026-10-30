<script lang="ts">
  // Local Omarchy layer: "From the beginning", the Coming up view of a memory a day, all of it in the fork module
  // (gallery/series)
  import SeriesPage from '$lib/gallery/series/SeriesPage.svelte';
  import type { PageData } from './$types';

  type Props = { data: PageData };

  let { data }: Props = $props();
</script>

<SeriesPage title={data.meta.title} />
