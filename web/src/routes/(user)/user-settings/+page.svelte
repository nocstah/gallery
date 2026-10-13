<script lang="ts">
  import UserPageLayout from '$lib/components/layouts/UserPageLayout.svelte';
  import UserSettingsList from './UserSettingsList.svelte';
  import { getKeyboardActions } from '$lib/services/keyboard.service';
  import { t } from 'svelte-i18n';
  import type { PageData } from './$types';

  type Props = {
    data: PageData;
  };

  let { data }: Props = $props();

  const { KeyboardShortcuts } = $derived(getKeyboardActions($t));
</script>

<UserPageLayout title={data.meta.title} actions={[KeyboardShortcuts]}>
  <!-- Local Omarchy layer: one column on the page's own gutter, not a box in the middle (omarchy-world.css) -->
  <div class="ws-page-column">
    <UserSettingsList keys={data.keys} sessions={data.sessions} />
  </div>
</UserPageLayout>
