<script lang="ts">
  // Local Omarchy layer: the family page's title, in its section of a series' page (gallery/series): the series' name,
  // which the family page shows over its days. Save asks Curator, which tidies it or refuses it in its own words (the
  // family page never shows a person's name or a day of the month), said under the field; an empty field gives the
  // page Curator's own title again. Once Curator saved a different title, the field shows what it saved.
  import { Field, Input } from '@immich/ui';
  import { untrack } from 'svelte';
  import { t } from 'svelte-i18n';
  import { DEFAULT_TITLE } from './series-api';

  type Props = {
    /** the title the family page has */
    name: string;
    /** a title is being saved */
    saving?: boolean;
    /** why Curator would not have the last one, in its words */
    refused?: string;
    onSave: (name: string) => void;
    /** the owner types again: what Curator said no longer stands */
    onType?: () => void;
  };

  let { name, saving = false, refused, onSave, onType }: Props = $props();

  const id = $props.id();

  let draft = $state(untrack(() => name));
  let shown = untrack(() => name);
  // a title saved here or elsewhere replaces what the field held, once it differs from the one it showed
  $effect.pre(() => {
    if (name !== shown) {
      shown = name;
      draft = name;
    }
  });

  // the title as Curator would keep it: spaces tidied, an empty one Curator's own
  const wanted = $derived(draft.split(/\s+/).filter(Boolean).join(' ') || DEFAULT_TITLE);
  const unchanged = $derived(wanted === name);

  const save = (event: SubmitEvent) => {
    event.preventDefault();
    if (!saving && !unchanged) {
      onSave(draft);
    }
  };
</script>

<form class="series-title" data-testid="series-title" onsubmit={save}>
  <Field label={$t('memory_series_page_title')} description={$t('memory_series_page_title_hint')} invalid={!!refused}>
    <Input
      bind:value={draft}
      autocomplete="off"
      aria-invalid={!!refused || undefined}
      aria-errormessage={refused ? `${id}-refused` : undefined}
      oninput={() => onType?.()}
    />
  </Field>
  {#if refused}
    <p class="series-title-refused" id="{id}-refused" role="alert">{refused}</p>
  {/if}
  <div class="series-title-actions">
    <button type="submit" class="ws-btn-quiet" disabled={saving || unchanged}>{$t('save')}</button>
  </div>
</form>

<style>
  .series-title {
    display: grid;
    gap: 0.5rem;
    max-width: 24rem;
    margin-top: 1.5rem;
  }
  .series-title-refused {
    font-size: var(--ws-text-meta);
    font-weight: 500;
    color: var(--ws-danger);
  }
  .series-title-actions {
    margin-inline-start: -0.6rem;
  }
</style>
