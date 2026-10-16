<script lang="ts">
  import { shortcutLabel } from '$lib/actions/shortcut';
  import MenuOption from '$lib/components/shared-components/context-menu/MenuOption.svelte';
  import { isEnabled } from '$lib/utils';
  import { type ActionItem } from '@immich/ui';

  type Props = {
    action: ActionItem;
    /**
     * Local Omarchy layer: show the action's key at the row's end, as the menus show B, V, Q and ⇧D (for menus where
     * that key does the same thing, such as the photos' right-click menu, which acts on the selection like the bar)
     */
    hint?: boolean;
  };

  const { action, hint = false }: Props = $props();
  const { title, icon, onAction } = $derived(action);
  const key = $derived.by(() => {
    const first = Array.isArray(action.shortcuts) ? action.shortcuts[0] : action.shortcuts;
    return hint && first ? shortcutLabel(first) : '';
  });
</script>

{#if icon && isEnabled(action)}
  <MenuOption {icon} text={title} shortcutLabel={key} onClick={(event: Event) => onAction({ event, action })} />
{/if}
