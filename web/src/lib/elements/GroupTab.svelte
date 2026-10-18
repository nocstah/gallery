<script lang="ts">
  import { generateId } from '$lib/utils/generate-id';

  interface Props {
    filters: string[];
    labels?: string[];
    selected: string;
    label: string;
    onSelect: (selected: string) => void;
  }

  let { filters, selected, label, labels, onSelect }: Props = $props();

  const id = `group-tab-${generateId()}`;
</script>

<!-- Local Omarchy layer: a segmented control like every other in the layer (.ws-seg): a transparent shell in a hairline
     frame, the option chosen inverted (ink fill, surface text), the others muted; upstream drew a grey slab with a
     lighter grey for the choice. Still radios in a fieldset, so the arrows move the choice -->
<fieldset class="ws-group-tab">
  <legend class="sr-only">{label}</legend>
  {#each filters as filter, index (`${id}-${index}`)}
    <input
      type="radio"
      name={id}
      id="{id}-{index}"
      class="sr-only"
      value={filter}
      checked={filter === selected}
      onchange={() => onSelect(filter)}
    />
    <label for="{id}-{index}">
      {labels?.[index] ?? filter}
    </label>
  {/each}
</fieldset>

<style>
  .ws-group-tab {
    display: inline-flex;
    gap: 2px;
    height: 100%;
    margin: 0;
    padding: 3px;
    border: 1px solid var(--ws-hairline);
    border-radius: var(--ws-radius);
  }
  .ws-group-tab label {
    display: flex;
    align-items: center;
    padding-inline: 0.75rem;
    border-radius: var(--ws-radius);
    color: var(--immich-ui-muted);
    font-size: var(--ws-text-ui);
    font-weight: 600;
    white-space: nowrap;
    cursor: pointer;
  }
  .ws-group-tab label:hover {
    color: var(--immich-ui-dark);
    background: color-mix(in oklab, var(--immich-ui-dark) 7%, transparent);
  }
  .ws-group-tab input:checked + label {
    background: var(--immich-ui-dark);
    color: var(--immich-ui-light);
  }
  .ws-group-tab input:focus-visible + label {
    outline: var(--ws-border) solid var(--ws-accent);
    outline-offset: 3px;
  }
</style>
