<script lang="ts">
  import type { Shortcut } from '$lib/actions/shortcut';
  import { shortcut as bindShortcut, shortcutLabel as computeShortcutLabel } from '$lib/actions/shortcut';
  import { optionClickCallbackStore, selectedIdStore } from '$lib/stores/context-menu.store';
  import { generateId } from '$lib/utils/generate-id';
  import { Icon, type IconLike } from '@immich/ui';

  interface Props {
    text: string;
    subtitle?: string;
    icon?: IconLike;
    activeColor?: string;
    textColor?: string;
    onClick: (event: KeyboardEvent | MouseEvent) => void;
    shortcut?: Shortcut | null;
    shortcutLabel?: string;
    /** Local Omarchy layer: 'danger' marks a destructive item (the menus draw it red) */
    tone?: 'danger';
    /** Local Omarchy layer: a test hook, for a control that moved from the bar into a menu and keeps its id */
    testId?: string;
    disabled?: boolean;
  }

  let {
    text,
    subtitle = '',
    icon,
    activeColor = 'bg-slate-300',
    textColor = 'text-immich-fg dark:text-immich-dark-bg',
    onClick,
    shortcut = null,
    shortcutLabel = '',
    tone,
    testId,
    disabled = false,
  }: Props = $props();

  let id: string = generateId();

  let isActive = $derived($selectedIdStore === id);

  const handleClick = (event: MouseEvent) => {
    if (disabled) {
      return;
    }
    // Svelte props can be lazy getters. Resolve the action while the menu's selection still exists, before closing
    // clears it (for example a video download whose handler captures the selected clips).
    const action = onClick;
    // eslint-disable-next-line unicorn/no-optional-chaining-on-undeclared-variable
    $optionClickCallbackStore?.();
    action(event);
  };

  if (shortcut && !shortcutLabel) {
    shortcutLabel = computeShortcutLabel(shortcut);
  }
  const bindShortcutIfSet = shortcut
    ? (n: HTMLElement) => bindShortcut(n, { shortcut, onShortcut: (event) => !disabled && onClick(event) })
    : () => {};
</script>

<svelte:document use:bindShortcutIfSet />

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_mouse_events_have_key_events -->
<li
  {id}
  onclick={handleClick}
  onmouseover={() => ($selectedIdStore = id)}
  onmouseleave={() => ($selectedIdStore = undefined)}
  class="w-full p-4 text-start text-sm font-medium {textColor} flex cursor-pointer items-center gap-2 border-gray-200 focus:ring-2 focus:outline-none focus:ring-inset {isActive
    ? activeColor
    : 'bg-slate-100'}"
  role="menuitem"
  aria-disabled={disabled || undefined}
  class:opacity-50={disabled}
  data-tone={tone}
  data-testid={testId}
>
  {#if icon}
    <Icon {icon} aria-hidden size="18" />
  {/if}
  <div class="w-full">
    <div class="flex justify-between">
      {text}
      {#if shortcutLabel}
        <!-- Local Omarchy layer: the hint is for the eye; the item's name stays its action ("Download", not
             "Download ⇧D"), as screen readers and the tests read it -->
        <span class="ps-4 text-gray-500" aria-hidden="true">
          {shortcutLabel}
        </span>
      {/if}
    </div>
    {#if subtitle}
      <p class="text-xs text-gray-500">
        {subtitle}
      </p>
    {/if}
  </div>
</li>
