<script lang="ts">
  // Local Omarchy layer: "July 2014" in Ctrl+K, the month (or year) Photos will open at (month-jump.ts).
  import { formatMonthJump, type MonthJump } from '$lib/managers/month-jump';
  import { Icon } from '@immich/ui';
  import { mdiCalendarMonthOutline } from '@mdi/js';
  import { locale, t } from 'svelte-i18n';

  interface Props {
    jump: MonthJump;
  }
  let { jump }: Props = $props();
</script>

<div
  class="flex h-[52px] items-center gap-3 rounded-lg px-3 py-2 transition-colors duration-80 ease-out group-data-selected:bg-primary/10"
>
  <div class="flex size-8 items-center justify-center rounded-md bg-subtle/40">
    <Icon icon={mdiCalendarMonthOutline} size="1.125em" class="text-gray-500 dark:text-gray-400" />
  </div>
  <div class="min-w-0 flex-1">
    <div class="truncate text-sm font-medium">{formatMonthJump(jump, $locale ?? 'en')}</div>
    <div class="truncate text-xs text-gray-500 dark:text-gray-400">
      {jump.month === undefined ? $t('cmdk_jump_year_description') : $t('cmdk_jump_month_description')}
    </div>
  </div>
</div>
