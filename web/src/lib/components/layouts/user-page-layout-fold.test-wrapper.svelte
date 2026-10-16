<script lang="ts">
  import UserPageLayout from './UserPageLayout.svelte';

  interface Props {
    /** how many icon buttons of the page's own the bar holds */
    count?: number;
    /** and a button that opens a list of its own (a sort menu) */
    withSort?: boolean;
    onPress?: (label: string) => void;
  }

  let { count = 2, withSort = false, onPress }: Props = $props();

  const labels = $derived(Array.from({ length: count }, (_, index) => `Tool ${index + 1}`));
</script>

<UserPageLayout title="Vietnam">
  {#snippet buttons()}
    {#each labels as label (label)}
      <button type="button" aria-label={label} onclick={() => onPress?.(label)}><svg></svg></button>
    {/each}
    {#if withSort}
      <button type="button" aria-haspopup="true" onclick={() => onPress?.('Sort')}>Sort</button>
    {/if}
  {/snippet}
</UserPageLayout>
