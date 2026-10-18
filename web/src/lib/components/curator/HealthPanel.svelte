<script lang="ts">
  // Local Omarchy layer: the library's health (Curator's /api/library-health). What needs a person comes first, each
  // with its number and where to deal with it; then the big face groups still without a name, how the library grew
  // month by month, and the local models Curator can use.
  import { curator, type LibraryHealth } from '$lib/utils/curator';
  import { onMount } from 'svelte';
  import { locale, t } from 'svelte-i18n';

  let report = $state<LibraryHealth>();

  const tallest = $derived(Math.max(1, ...(report?.months ?? []).map((month) => month.items)));

  const monthLabel = (value: string) =>
    new Date(`${value}-15T12:00:00`).toLocaleDateString($locale ?? undefined, { month: 'short', year: '2-digit' });

  onMount(async () => {
    report = await curator.libraryHealth();
  });
</script>

{#if report}
  <ul class="ws-inbox-rows">
    {#each report.items as item (item.key)}
      <li>
        <div class="ws-inbox-row health-row" data-attention={item.attention ? true : undefined}>
          <div class="health-text">
            <span class="ws-inbox-row-title">{item.title}</span>
            {#if item.attention}
              <span class="health-flag">{$t('ai_inbox_health_attention')}</span>
            {/if}
            <p class="ws-inbox-row-body">{item.detail}</p>
          </div>
          <span class="health-value">
            {typeof item.value === 'number' ? item.value.toLocaleString($locale ?? undefined) : (item.value ?? '–')}
          </span>
          {#if item.link}
            <a class="ws-inbox-link" href={item.link}>{$t('ai_inbox_health_open')}</a>
          {:else}
            <span></span>
          {/if}
        </div>
      </li>
    {/each}
  </ul>

  {#if report.people_unnamed.length > 0}
    <h2 class="health-heading">{$t('ai_inbox_health_unnamed')}</h2>
    <ul class="health-faces">
      {#each report.people_unnamed as person (person.id)}
        <li>
          <a href="/people/{person.id}">
            <img src="/api/people/{person.id}/thumbnail" alt="" loading="lazy" />
            <span class="ws-inbox-meta">{person.faces}</span>
          </a>
        </li>
      {/each}
    </ul>
  {/if}

  {#if report.months.length > 0}
    <h2 class="health-heading">{$t('ai_inbox_health_growth')}</h2>
    <ol class="health-months">
      {#each report.months as month (month.month)}
        <li title="{month.items} · {(month.bytes / 1e9).toFixed(1)} GB">
          <span class="health-bar" style:height="{(month.items / tallest) * 100}%"></span>
          <span class="ws-inbox-meta">{monthLabel(month.month)}</span>
          <span class="ws-inbox-meta">{month.items}</span>
        </li>
      {/each}
    </ol>
  {/if}

  <h2 class="health-heading">{$t('ai_inbox_health_models')}</h2>
  <p class="ws-inbox-meta health-models">
    {#if report.models.error}
      {report.models.error}
    {:else}
      {(report.models.installed ?? []).join(' · ') || '–'} · {(report.models.loaded ?? []).length > 0
        ? (report.models.loaded ?? []).join(', ')
        : $t('ai_inbox_health_none_loaded')}
    {/if}
  </p>
{/if}

<style>
  .health-row {
    grid-template-columns: minmax(0, 1fr) auto 4rem;
    align-items: center;
  }
  .health-text {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0.25rem 0.75rem;
  }
  .health-text p {
    flex-basis: 100%;
  }
  /* attention is inversion, like an active workspace: the accent stays for focus */
  .health-flag {
    padding: 0.1rem 0.45rem;
    border-radius: var(--ws-radius);
    background: var(--immich-ui-dark);
    color: var(--immich-ui-light);
    font-family: var(--ws-font-data);
    font-size: var(--ws-text-data);
    font-weight: 600;
  }
  .health-value {
    font-family: var(--font-display);
    font-size: var(--ws-text-title);
    font-weight: 750;
    font-variation-settings:
      'wdth' 80,
      'opsz' 72;
    font-variant-numeric: tabular-nums;
    letter-spacing: -0.02em;
    text-align: end;
  }
  .health-row:not([data-attention]) .health-value {
    color: var(--immich-ui-muted);
  }
  /* a section's name in the heading role over a hairline, as Shared and Utilities head theirs */
  .health-heading {
    margin-top: 2rem;
    padding-bottom: 0.5rem;
    border-bottom: 1px solid var(--ws-hairline);
    font-size: var(--ws-text-heading);
    font-weight: 600;
  }
  .health-faces {
    display: flex;
    flex-wrap: wrap;
    gap: var(--ws-gap);
    padding-top: 1rem;
    list-style: none;
  }
  .health-faces a {
    display: grid;
    justify-items: center;
    gap: 0.3rem;
  }
  .health-faces img {
    width: 4.5rem;
    height: 4.5rem;
    border-radius: 999px;
    object-fit: cover;
    outline: 1px solid var(--ws-hairline);
    outline-offset: -1px;
  }
  .health-faces a:hover img,
  .health-faces a:focus-visible img {
    outline: var(--ws-border) solid var(--ws-accent);
    outline-offset: calc(var(--ws-border) * -1);
  }
  .health-months {
    display: flex;
    align-items: flex-end;
    gap: 0.5rem;
    height: 9rem;
    padding-top: 1rem;
    list-style: none;
  }
  .health-months li {
    display: grid;
    grid-template-rows: minmax(0, 1fr) auto auto;
    justify-items: center;
    align-items: end;
    gap: 0.2rem;
    height: 100%;
    width: 3rem;
  }
  .health-bar {
    width: 100%;
    min-height: 2px;
    border-radius: 2px 2px 0 0;
    background: var(--immich-ui-dark);
  }
  .health-models {
    padding-top: 0.75rem;
  }
</style>
