<script lang="ts">
  // Local Omarchy layer: the search page's query in the one bar (the page lives in the shell since 2026-10-15). A back
  // arrow, then the query as a field: Enter searches again in place, Escape takes an edit back (then leaves the field),
  // Ctrl+/ steps through the modes as it does in the palette, whose mode control sits at the field's end. The count
  // follows in data type while the bar has room for it (`roomy`; the page shows it under the bar otherwise), and what
  // acts on the count right after it (the page's Add all). On a phone the field keeps the bar: the back arrow goes, and
  // the mode shows as its icon. The page's h1 is here too, unseen: what the results are for.
  import SearchModeControl from '$lib/components/global-search/search-mode-control.svelte';
  import { isTextSearchMode, textSearchModes, type TextSearchMode } from '$lib/utils/search-mode-terms';
  import { Icon } from '@immich/ui';
  import { mdiArrowLeft, mdiClose, mdiMagnify } from '@mdi/js';
  import { onMount, type Snippet } from 'svelte';
  import { t, type Translations } from 'svelte-i18n';

  type Props = {
    /** what the field holds: the search's text until edited */
    draft: string;
    /** the text the results are for, which Escape goes back to */
    committed: string;
    mode: TextSearchMode;
    /** the number of results, already worded ("248 photos", "100+ photos"); none while unknown */
    count?: string;
    /** what acts on that count, right beside it (the page's Add all) */
    countAction?: Snippet;
    /** a phone: no back arrow, the mode as its icon, the count under the bar */
    narrow?: boolean;
    /** whether the bar has room for the count (set here, read by the page) */
    roomy?: boolean;
    autofocus?: boolean;
    smartUnavailable?: boolean;
    onSubmit: () => void;
    onModeChange: (mode: TextSearchMode) => void;
    onBack?: () => void;
  };

  let {
    draft = $bindable(),
    committed,
    mode,
    count,
    countAction,
    narrow = false,
    roomy = $bindable(true),
    autofocus = false,
    smartUnavailable = false,
    onSubmit,
    onModeChange,
    onBack,
  }: Props = $props();

  // what the field says it does in each mode, while empty
  const placeholders: Record<TextSearchMode, Translations> = {
    smart: 'search_by_context',
    metadata: 'search_by_filename',
    description: 'search_by_description',
    ocr: 'search_by_ocr',
  };

  let field = $state<HTMLInputElement>();
  let width = $state(0);
  // under 34rem (the Dell's real width with the sidebar folded) the count gives the field its room; under 26rem the
  // mode is its icon alone
  const ROOMY_PX = 544;
  const COMPACT_PX = 416;
  // (measured once laid out: until then the page's own guess stands, so the count does not hop on the first frame)
  $effect(() => {
    if (narrow) {
      roomy = false;
    } else if (width > 0) {
      roomy = width >= ROOMY_PX;
    }
  });
  const compact = $derived(narrow || (width > 0 && width < COMPACT_PX));

  onMount(() => {
    if (autofocus) {
      field?.focus();
    }
  });

  const onKeydown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      if (draft === committed) {
        field?.blur();
      } else {
        draft = committed;
      }
      return;
    }
    if (event.ctrlKey && event.key === '/') {
      event.preventDefault();
      onModeChange(textSearchModes[(textSearchModes.indexOf(mode) + 1) % textSearchModes.length]);
    }
  };

  const clear = () => {
    draft = '';
    field?.focus();
  };
</script>

<div class="ws-search-query" data-compact={compact ? '' : undefined} bind:clientWidth={width}>
  <!-- the page's h1 (DESIGN.md, One heading): the query is its title, but a field, which a heading cannot be, so the
       heading says it in words for a screen reader and draws nothing -->
  <h1 class="sr-only" data-testid="search-heading">
    {committed ? $t('search_results_for', { values: { query: committed } }) : $t('search')}
  </h1>
  {#if onBack && !narrow}
    <button type="button" class="ws-bar-icon" aria-label={$t('back')} title={$t('back')} onclick={onBack}>
      <Icon icon={mdiArrowLeft} size="20" />
    </button>
  {/if}

  <form
    class="ws-search-field ws-search-box"
    role="search"
    onsubmit={(event) => {
      event.preventDefault();
      onSubmit();
    }}
  >
    <Icon icon={mdiMagnify} size="18" class="ws-search-box-icon" aria-hidden />
    <input
      bind:this={field}
      bind:value={draft}
      type="search"
      enterkeyhint="search"
      autocomplete="off"
      spellcheck="false"
      maxlength={256}
      aria-label={$t('search_your_photos')}
      placeholder={$t(placeholders[mode])}
      onkeydown={onKeydown}
      data-testid="search-query-field"
    />
    {#if draft}
      <button
        type="button"
        class="ws-search-box-clear"
        aria-label={$t('clear_value')}
        title={$t('clear_value')}
        onclick={clear}
      >
        <Icon icon={mdiClose} size="16" />
      </button>
    {/if}
    <span class="ws-search-box-rule" aria-hidden="true"></span>
    <SearchModeControl
      variant="chip"
      {mode}
      modes={textSearchModes}
      {smartUnavailable}
      onSelect={(next) => {
        if (isTextSearchMode(next)) {
          onModeChange(next);
        }
      }}
    />
  </form>

  {#if count && roomy}
    <span class="ws-search-count" data-testid="search-result-count">{count}</span>
    {@render countAction?.()}
  {/if}
</div>

<style>
  .ws-search-query {
    display: flex;
    flex: 1;
    gap: 0.5rem;
    align-items: center;
    min-width: 0;
    height: 100%;
    padding-inline-end: 0.5rem;
  }
  /* the field: the list search's frame (.ws-search-field: the ground, a hairline, the accent inside on focus), as tall
     as the page buttons, wide enough for a sentence and never wider */
  .ws-search-box {
    display: flex;
    flex: 0 1 38rem;
    align-items: center;
    min-width: 0;
    height: 2.25rem;
    padding-inline-start: 0.625rem;
    border-radius: var(--ws-radius);
  }
  .ws-search-box :global(.ws-search-box-icon) {
    flex: none;
    color: var(--immich-ui-muted);
  }
  .ws-search-box input {
    flex: 1;
    min-width: 3rem;
    height: 100%;
    padding-inline: 0.5rem;
    border: 0;
    font-size: var(--ws-text-body);
    /* the browser's own clear cross gives way to the one below */
    appearance: none;
  }
  .ws-search-box input::-webkit-search-cancel-button {
    display: none;
  }
  .ws-search-box-clear {
    display: grid;
    flex: none;
    place-items: center;
    width: 1.75rem;
    height: 1.75rem;
    margin-inline-end: 0.25rem;
    border-radius: var(--ws-radius);
    color: var(--immich-ui-muted);
  }
  .ws-search-box-clear:hover {
    color: var(--immich-ui-dark);
    background: color-mix(in oklab, var(--immich-ui-dark) 8%, transparent);
  }
  .ws-search-box-clear:focus-visible {
    outline: var(--ws-border) solid var(--ws-accent);
    outline-offset: -2px;
  }
  /* the mode at the field's end, behind a full-height hairline */
  .ws-search-box-rule {
    flex: none;
    align-self: stretch;
    width: 1px;
    background: var(--ws-hairline);
  }
  .ws-search-box :global([data-testid='search-mode-chip']) {
    align-self: stretch;
  }
  /* the palette's chip, as a control of the bar: no frame of its own (the field's is around it), ui type in ink, inset
     a pixel so its hover tint stays inside the field's hairline */
  .ws-search-box :global([data-testid='search-mode-chip-trigger']) {
    height: calc(100% - 2px);
    margin: 1px;
    padding-inline: 0.625rem 0.5rem;
    gap: 0.375rem;
    border: 0;
    border-radius: var(--ws-radius);
    background: transparent;
    color: var(--immich-ui-dark);
    font-size: var(--ws-text-ui);
    font-weight: 600;
    letter-spacing: normal;
    white-space: nowrap;
  }
  .ws-search-box :global([data-testid='search-mode-chip-trigger'] svg) {
    width: 16px;
    height: 16px;
  }
  .ws-search-box :global([data-testid='search-mode-chip-trigger'] svg:last-child) {
    width: 14px;
    height: 14px;
    color: var(--immich-ui-muted);
  }
  .ws-search-box :global([data-testid='search-mode-chip-trigger']:hover),
  .ws-search-box :global([data-testid='search-mode-chip-trigger'][aria-expanded='true']) {
    background: color-mix(in oklab, var(--immich-ui-dark) 8%, transparent);
    color: var(--immich-ui-dark);
  }
  .ws-search-box :global([data-testid='search-mode-chip-trigger']:focus-visible) {
    outline: var(--ws-border) solid var(--ws-accent);
    outline-offset: -2px;
  }
  /* a narrow bar gives the text the room: no magnifier (the mode's icon says it is a search), the mode as its icon
     alone, the clear cross only while the field is being edited */
  .ws-search-query[data-compact] .ws-search-box {
    padding-inline-start: 0.125rem;
  }
  .ws-search-query[data-compact] :global(.ws-search-box-icon),
  .ws-search-query[data-compact] :global([data-testid='search-mode-chip-trigger'] > span),
  .ws-search-query[data-compact] :global([data-testid='search-mode-chip-trigger'] > svg:last-child),
  .ws-search-query[data-compact] .ws-search-box:not(:focus-within) .ws-search-box-clear {
    display: none;
  }
  .ws-search-query[data-compact] :global([data-testid='search-mode-chip-trigger']) {
    padding-inline: 0.5rem;
  }
  /* its menu is a sheet like the view menu's: one frame, the theme's corners, rows edge to edge, the mode in use
     inverted */
  .ws-search-box :global([data-testid='search-mode-chip'] [role='menu']) {
    top: calc(100% + 0.625rem);
    right: -1px;
    min-width: 12rem;
    margin: 0;
    padding: 6px;
    border: 1px solid color-mix(in oklab, var(--immich-ui-dark) 12%, transparent);
    border-radius: var(--ws-radius);
    background: var(--immich-ui-light);
    box-shadow:
      0 4px 12px -4px rgb(0 0 0 / 0.25),
      0 24px 48px -12px rgb(0 0 0 / 0.45);
  }
  .ws-search-box :global([role='menuitemradio']) {
    gap: 0.6rem;
    min-height: 2.1rem;
    padding: 0.3rem 0.55rem;
    border-radius: var(--ws-radius);
    color: var(--immich-ui-dark);
    font-size: var(--ws-text-meta);
    font-weight: 500;
  }
  .ws-search-box :global([role='menuitemradio']:hover) {
    background: color-mix(in oklab, var(--ws-accent) 16%, transparent);
  }
  .ws-search-box :global([role='menuitemradio'][aria-checked='true']) {
    background: var(--immich-ui-dark);
    color: var(--immich-ui-light);
    font-weight: 600;
  }
  .ws-search-box :global([role='menuitemradio']:focus-visible) {
    outline: var(--ws-border) solid var(--ws-accent);
    outline-offset: -2px;
  }
  .ws-search-count {
    flex: none;
    font-family: var(--ws-font-data);
    font-size: var(--ws-text-data);
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    color: var(--immich-ui-muted);
    white-space: nowrap;
  }
  /* a phone: the field takes the bar, and the bar's own search icon (the palette) gives it its room while this field
     is there; Ctrl+K and / still open the palette where there is a keyboard */
  .ws-search-query[data-compact] .ws-search-box {
    flex: 1 1 auto;
  }
  @media (max-width: 767px) {
    :global(.ws-bar:has(.ws-search-query) .ws-bar-search) {
      display: none;
    }
  }
</style>
