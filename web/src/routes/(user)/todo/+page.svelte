<script lang="ts">
  // Local Omarchy layer: To do before anything has been set aside; once the album exists the sidebar opens it instead
  import UserPageLayout from '$lib/components/layouts/UserPageLayout.svelte';
  import { Route } from '$lib/route';
  import { t } from 'svelte-i18n';
  import type { PageData } from './$types';

  type Props = {
    data: PageData;
  };

  let { data }: Props = $props();
</script>

<UserPageLayout title={data.meta.title}>
  <div class="ws-page-column">
    <div class="ws-empty">
      <h2 class="ws-empty-title">{$t('todo_empty_title')}</h2>
      <p class="ws-empty-body">{$t('todo_empty_body')}</p>
      <div class="ws-empty-actions">
        <a class="ws-empty-action" href={Route.photos()}>{$t('photos')}</a>
      </div>
    </div>
  </div>
</UserPageLayout>
