<script lang="ts">
  // Local Omarchy layer: "From the beginning", the owner's series of a memory a day, each opening its own page, all of
  // it in the fork module (gallery/series)
  import SeriesList from '$lib/gallery/series/SeriesList.svelte';
  import type { PageData } from './$types';

  type Props = { data: PageData };

  let { data }: Props = $props();
</script>

<SeriesList title={data.meta.title} />
