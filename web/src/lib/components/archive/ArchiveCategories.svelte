<script lang="ts">
  // Local Omarchy layer: the Archive's categories, as a row of buttons above it: All, then every Auto/ tag
  // (Gallery's classifier files Screenshots, Receipts and Documents there; Curator adds Accidental shots and
  // QR codes) that has archived photos, the largest first. Picking one shows only that category.
  import { AssetVisibility, getAllTags, getTimeBuckets } from '@immich/sdk';
  import { onMount } from 'svelte';
  import { t } from 'svelte-i18n';

  interface Props {
    tagId?: string;
  }

  let { tagId = $bindable() }: Props = $props();

  type Category = { id: string; name: string; count: number };
  let categories = $state<Category[]>([]);

  const archivedIn = async (id: string) => {
    const buckets = await getTimeBuckets({ visibility: AssetVisibility.Archive, tagId: id });
    return buckets.reduce((sum, bucket) => sum + bucket.count, 0);
  };

  onMount(async () => {
    try {
      const allTags = await getAllTags();
      const tags = allTags.filter((tag) => tag.value.startsWith('Auto/'));
      const counted = await Promise.all(
        tags.map(async (tag) => ({ id: tag.id, name: tag.name, count: await archivedIn(tag.id) })),
      );
      categories = counted.filter((category) => category.count > 0).sort((a, b) => b.count - a.count);
    } catch {
      categories = [];
    }
  });
</script>

{#if categories.length > 0}
  <div class="ws-seg archive-categories" role="group" aria-label={$t('archive')}>
    <button type="button" aria-pressed={!tagId} onclick={() => (tagId = undefined)}>{$t('all')}</button>
    {#each categories as category (category.id)}
      <button type="button" aria-pressed={tagId === category.id} onclick={() => (tagId = category.id)}>
        {category.name}
        <span class="count">{category.count.toLocaleString()}</span>
      </button>
    {/each}
  </div>
{/if}

<style>
  .archive-categories {
    margin: 0.25rem 0 0.5rem 0.5rem;
    flex-wrap: wrap;
    width: fit-content;
  }
  .count {
    opacity: 0.6;
    margin-inline-start: 0.3rem;
    font-variant-numeric: tabular-nums;
  }
</style>
