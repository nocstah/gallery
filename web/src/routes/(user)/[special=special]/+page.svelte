<script lang="ts">
  // Local Omarchy layer: a special album (To do, Villa) before anything has gone there; once the album exists its
  // sidebar row opens it instead
  import UserPageLayout from '$lib/components/layouts/UserPageLayout.svelte';
  import { specialAlbums } from '$lib/managers/special-albums.svelte';
  import { Route } from '$lib/route';
  import { t } from 'svelte-i18n';
  import type { PageData } from './$types';

  type Props = {
    data: PageData;
  };

  let { data }: Props = $props();

  const special = $derived(specialAlbums.find(({ slug }) => slug === data.slug));
</script>

<UserPageLayout title={data.meta.title}>
  <div class="ws-page-column">
    {#if special}
      <div class="ws-empty">
        <h2 class="ws-empty-title">{$t(special.words.emptyTitle)}</h2>
        <p class="ws-empty-body">{$t(special.words.emptyBody)}</p>
        <div class="ws-empty-actions">
          <a class="ws-empty-action" href={Route.photos()}>{$t('photos')}</a>
        </div>
      </div>
    {/if}
  </div>
</UserPageLayout>
