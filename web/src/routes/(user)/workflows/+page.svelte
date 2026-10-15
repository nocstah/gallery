<script lang="ts">
  import { goto } from '$app/navigation';
  import UserPageLayout from '$lib/components/layouts/UserPageLayout.svelte';
  import OnEvents from '$lib/components/OnEvents.svelte';
  import { Route } from '$lib/route';
  import { getWorkflowActions, getWorkflowsActions, getWorkflowShowSchemaAction } from '$lib/services/workflow.service';
  import { getTriggerName } from '$lib/utils/workflow';
  import { getWorkflowForShare, type WorkflowResponseDto } from '@immich/sdk';
  import { Button, CodeBlock, ContextMenuButton, Icon, MenuItemType } from '@immich/ui';
  import { mdiClose, mdiFlashOutline } from '@mdi/js';
  import { t } from 'svelte-i18n';
  import { SvelteSet } from 'svelte/reactivity';
  import type { PageData } from './$types';

  type Props = {
    data: PageData;
  };

  let { data }: Props = $props();

  let workflows = $state<WorkflowResponseDto[]>(data.workflows);

  const expandedIds = new SvelteSet<string>();

  const onToggleExpand = (id: string) => {
    if (expandedIds.has(id)) {
      expandedIds.delete(id);
    } else {
      expandedIds.add(id);
    }
  };

  const { Create, UseTemplate } = $derived(getWorkflowsActions($t));

  const onWorkflowCreate = async (response: WorkflowResponseDto) => {
    await goto(Route.viewWorkflow(response));
  };

  const onWorkflowUpdate = (response: WorkflowResponseDto) => {
    workflows = workflows.map((workflow) => (workflow.id === response.id ? response : workflow));
  };

  const onWorkflowDelete = (response: WorkflowResponseDto) => {
    workflows = workflows.filter(({ id }) => id !== response.id);
  };
</script>

<OnEvents {onWorkflowCreate} {onWorkflowUpdate} {onWorkflowDelete} />

<UserPageLayout title={data.meta.title} actions={[UseTemplate, Create]} scrollbar={false}>
  <!-- Local Omarchy layer: the workflows as rows on the page's gutter, split by hairlines (upstream: a card each in a
       centred column). A row is its name in the heading role, its description in muted meta, its trigger in data type,
       and "Disabled" in data type while it is off (the row steps back); the menu at the row's end. With none, an empty
       state with the next step -->
  <div class="ws-page-column">
    {#if workflows.length === 0}
      <div class="ws-empty">
        <h2 class="ws-empty-title">{$t('nothing_here_yet')}</h2>
        <p class="ws-empty-body">{$t('workflows_help_text')}</p>
        <div class="ws-empty-actions">
          <button
            type="button"
            class="ws-empty-action"
            onclick={(event: MouseEvent) => Create.onAction({ event, action: Create })}
          >
            {$t('create_first_workflow')}
          </button>
          <button
            type="button"
            class="ws-empty-link"
            onclick={(event: MouseEvent) => UseTemplate.onAction({ event, action: UseTemplate })}
          >
            {$t('browse_templates')}
          </button>
        </div>
      </div>
    {:else}
      <p class="ws-workflows-note">{$t('workflows_help_text')}</p>
      <ul class="ws-workflows">
        {#each workflows as workflow (workflow.id)}
          {@const { ToggleEnabled, Duplicate, Logs, Edit, Delete } = getWorkflowActions($t, workflow)}

          <li class="ws-workflow" class:ws-workflow-off={!workflow.enabled}>
            <div class="ws-workflow-row">
              <a href={Route.viewWorkflow({ id: workflow.id })} class="ws-workflow-link">
                <Icon icon={mdiFlashOutline} size="20" />
                <span class="ws-workflow-text">
                  <span class="ws-workflow-name">
                    {workflow.name || $t('workflow')}
                    {#if !workflow.enabled}
                      <span class="ws-workflow-state">{$t('disabled')}</span>
                    {/if}
                  </span>
                  {#if workflow.description}
                    <span class="ws-workflow-description">{workflow.description}</span>
                  {/if}
                  <span class="ws-workflow-trigger">
                    {$t('trigger')} <span class="ws-workflow-data">{getTriggerName($t, workflow.trigger)}</span>
                  </span>
                </span>
              </a>

              <ContextMenuButton
                position="top-left"
                items={[
                  ToggleEnabled,
                  Edit,
                  Duplicate,
                  Logs,
                  getWorkflowShowSchemaAction($t, expandedIds.has(workflow.id), () => onToggleExpand(workflow.id)),
                  MenuItemType.Divider,
                  Delete,
                ]}
              />
            </div>

            {#if expandedIds.has(workflow.id)}
              {#await getWorkflowForShare({ id: workflow.id }) then result}
                <div class="ws-workflow-schema">
                  <CodeBlock code={JSON.stringify(result, null, 2)} lineNumbers />
                  <Button
                    class="mt-2"
                    leadingIcon={mdiClose}
                    variant="ghost"
                    color="secondary"
                    onclick={() => onToggleExpand(workflow.id)}
                  >
                    {$t('close')}
                  </Button>
                </div>
              {/await}
            {/if}
          </li>
        {/each}
      </ul>
    {/if}
  </div>
</UserPageLayout>

<style>
  .ws-workflows-note {
    max-width: 60ch;
    margin-bottom: calc(var(--ws-gap) * 0.8);
    font-size: var(--ws-text-ui);
    line-height: 1.5;
    color: var(--immich-ui-muted);
  }
  .ws-workflows {
    list-style: none;
    border-top: 1px solid var(--ws-hairline);
    color: var(--immich-ui-dark);
  }
  .ws-workflow {
    border-bottom: 1px solid var(--ws-hairline);
  }
  .ws-workflow-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding-inline-end: 0.25rem;
    border-radius: var(--ws-radius);
    transition: background-color 140ms cubic-bezier(0.22, 1, 0.36, 1);
  }
  .ws-workflow-row:hover {
    background: color-mix(in oklab, var(--immich-ui-dark) 4%, transparent);
  }
  .ws-workflow-link {
    display: flex;
    flex: 1;
    gap: 0.75rem;
    align-items: flex-start;
    min-width: 0;
    padding: 0.95rem 0.5rem;
    border-radius: var(--ws-radius);
  }
  .ws-workflow-link:focus-visible {
    outline: var(--ws-border) solid var(--ws-accent);
    outline-offset: calc(var(--ws-border) * -1);
  }
  .ws-workflow-link > :global(svg) {
    flex: none;
    margin-top: 0.1rem;
    color: var(--immich-ui-muted);
  }
  .ws-workflow-row:hover .ws-workflow-link > :global(svg) {
    color: var(--immich-ui-dark);
  }
  .ws-workflow-text {
    display: grid;
    gap: 0.2rem;
    min-width: 0;
  }
  .ws-workflow-name {
    display: flex;
    flex-wrap: wrap;
    gap: 0.6rem;
    align-items: baseline;
    font-size: var(--ws-text-heading);
    font-weight: 600;
    line-height: 1.25;
  }
  .ws-workflow-state,
  .ws-workflow-data {
    font-family: var(--ws-font-data);
    font-size: var(--ws-text-data);
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }
  .ws-workflow-state {
    color: var(--immich-ui-muted);
  }
  .ws-workflow-description,
  .ws-workflow-trigger {
    overflow: hidden;
    font-size: var(--ws-text-meta);
    line-height: 1.45;
    color: var(--immich-ui-muted);
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .ws-workflow-data {
    margin-inline-start: 0.25rem;
    color: var(--immich-ui-dark);
  }
  /* a workflow that is off steps back: its name in muted ink */
  .ws-workflow-off .ws-workflow-name {
    color: var(--immich-ui-muted);
  }
  .ws-workflow-schema {
    padding: 0 0.5rem 1.25rem calc(0.5rem + 20px + 0.75rem);
  }
  @media (prefers-reduced-motion: reduce) {
    .ws-workflow-row {
      transition: none;
    }
  }
</style>
