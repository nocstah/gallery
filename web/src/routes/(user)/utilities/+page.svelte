<script lang="ts">
  import UserPageLayout from '$lib/components/layouts/UserPageLayout.svelte';
  import type { PageData } from './$types';
  import UtilitiesMenu from './UtilitiesMenu.svelte';

  interface Props {
    data: PageData;
  }

  let { data }: Props = $props();
</script>

<UserPageLayout title={data.meta.title}>
  <!-- Local Omarchy layer: on the gutter like Settings, not centred in the page -->
  <div class="w-full max-w-xl">
    <div class="mt-5">
      <UtilitiesMenu />
    </div>
  </div>
</UserPageLayout>
