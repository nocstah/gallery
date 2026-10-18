<script lang="ts">
  import { Icon } from '@immich/ui';
  import { mdiStar, mdiStarOutline } from '@mdi/js';
  import { t } from 'svelte-i18n';

  interface Props {
    selectedRating?: number;
    availableRatings?: number[];
    onRatingChange: (rating?: number) => void;
  }

  let { selectedRating, availableRatings, onRatingChange }: Props = $props();

  function handleStarClick(star: number) {
    if (selectedRating === star) {
      onRatingChange(undefined);
    } else {
      onRatingChange(star);
    }
  }

  const visibleStars = [1, 2, 3, 4, 5];
</script>

<!-- Local Omarchy layer: the stars were five unnamed buttons, the empty ones a pale grey on the ground (1.4:1 light,
     2.4:1 dark). Each says what it picks (the filter takes that many stars or more, as its chip's "≥ 3 stars") and
     whether it is the one picked, and they draw as the viewer's rating does: filled stars in ink, the others outlined in
     muted ink. A second press takes it back -->
<div class="flex gap-1" role="group" aria-label={$t('rating')} data-testid="rating-filter">
  {#each visibleStars as star (star)}
    {@const filled = selectedRating !== undefined && star <= selectedRating}
    {@const isOrphaned = availableRatings !== undefined && !availableRatings.includes(star)}
    <button
      type="button"
      class="flex items-center justify-center p-0.5 {isOrphaned ? 'opacity-50' : ''}"
      aria-label={$t('filter_rating_at_least', { values: { rating: star } })}
      aria-pressed={selectedRating === star}
      title={$t('filter_rating_at_least', { values: { rating: star } })}
      onclick={() => handleStarClick(star)}
      data-testid="rating-star-{star}"
    >
      <Icon
        icon={filled ? mdiStar : mdiStarOutline}
        size="20"
        class={filled ? 'text-dark' : 'text-muted'}
        aria-hidden={true}
      />
    </button>
  {/each}
</div>
