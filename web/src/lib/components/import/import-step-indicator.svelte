<script lang="ts">
  import { ImportStep } from '$lib/managers/import-manager.svelte';
  import { Icon } from '@immich/ui';
  import { mdiCheck } from '@mdi/js';
  import { t, type Translations } from 'svelte-i18n';

  interface Props {
    currentStep: ImportStep;
  }

  let { currentStep }: Props = $props();

  const steps: Array<{ index: ImportStep; label: Translations }> = [
    { index: ImportStep.Source, label: 'import_step_source' as Translations },
    { index: ImportStep.Files, label: 'import_step_files' as Translations },
    { index: ImportStep.Scan, label: 'import_step_scan' as Translations },
    { index: ImportStep.Review, label: 'import_step_review' as Translations },
    { index: ImportStep.Import, label: 'import_step_import' as Translations },
  ];
</script>

<!-- Local Omarchy layer: the steps as one line on the gutter, a hairline under it: each its number in data type and its
     name; the step in hand inverted (ink fill, surface text) like the year in view, the ones done in ink with a check,
     the ones to come muted. A phone keeps the names of the step in hand only -->
<ol class="ws-import-steps">
  {#each steps as step (step.index)}
    <li
      class="ws-import-steps-item"
      class:ws-import-steps-now={step.index === currentStep}
      class:ws-import-steps-done={step.index < currentStep}
      data-testid="step-{step.index}"
      data-completed={step.index < currentStep ? 'true' : 'false'}
      aria-current={step.index === currentStep ? 'step' : undefined}
    >
      <span class="ws-import-steps-number">
        {#if step.index < currentStep}
          <Icon icon={mdiCheck} size="14" />
        {:else}
          {step.index + 1}
        {/if}
      </span>
      <span class="ws-import-steps-name">{$t(step.label)}</span>
    </li>
  {/each}
</ol>

<style>
  .ws-import-steps {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.25rem 1rem;
    padding-bottom: calc(var(--ws-gap) * 0.8);
    border-bottom: 1px solid var(--ws-hairline);
    list-style: none;
  }
  .ws-import-steps-item {
    position: relative;
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.3rem 0.55rem;
    border-radius: var(--ws-radius);
    color: var(--immich-ui-muted);
    font-size: var(--ws-text-ui);
    font-weight: 500;
    white-space: nowrap;
  }
  /* a short hairline leads from one step to the next, in the gap between them */
  .ws-import-steps-item + .ws-import-steps-item::before {
    content: '';
    position: absolute;
    inset-inline-end: 100%;
    top: 50%;
    width: 1rem;
    height: 1px;
    background: var(--ws-hairline);
  }
  .ws-import-steps-number {
    display: inline-grid;
    place-items: center;
    min-width: 1ch;
    font-family: var(--ws-font-data);
    font-size: var(--ws-text-data);
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }
  .ws-import-steps-done {
    color: var(--immich-ui-dark);
  }
  .ws-import-steps-now {
    background: var(--immich-ui-dark);
    color: var(--immich-ui-light);
    font-weight: 600;
  }
  @media (max-width: 639px) {
    .ws-import-steps-item:not(.ws-import-steps-now) .ws-import-steps-name {
      display: none;
    }
  }
</style>
