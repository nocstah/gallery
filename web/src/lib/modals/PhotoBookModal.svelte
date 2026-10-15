<script lang="ts">
  // Local Omarchy layer: what a photo book should be (managers/photo-book-manager): its title, starting from the
  // album's name or the year, and about how many photos; for a year's book, which year, the title following it until
  // it is typed over. Curator makes the book once this closes; a cleared title leaves the title to Curator.
  import type { BookDialog } from '$lib/managers/photo-book-manager.svelte';
  import { BOOK_PHOTOS } from '$lib/utils/curator';
  import { Field, FormModal, Input, NumberInput, Select } from '@immich/ui';
  import { mdiBookOpenPageVariantOutline } from '@mdi/js';
  import { untrack } from 'svelte';
  import { t } from 'svelte-i18n';

  type Props = BookDialog;

  const {
    title: startTitle,
    photos: startPhotos = BOOK_PHOTOS.standard,
    years = [],
    year: startYear,
    onClose,
  }: Props = $props();

  // the fields start from what the dialog is given, and are the person's from then on
  let title = $state(untrack(() => startTitle));
  let photos = $state<number | undefined>(untrack(() => startPhotos));
  let year = $state(untrack(() => String(startYear ?? years[0]?.year ?? '')));

  const yearOptions = $derived(
    years.map((option) => ({
      value: String(option.year),
      label: `${option.year} · ${$t('items_count', { values: { count: option.count } })}`,
    })),
  );

  const pickYear = (next: string) => {
    if (!title.trim() || title.trim() === year) {
      title = next;
    }
    year = next;
  };

  const onSubmit = () => {
    const wanted = Math.round(photos ?? BOOK_PHOTOS.standard);
    onClose({
      title: title.trim(),
      photos: Math.min(BOOK_PHOTOS.most, Math.max(BOOK_PHOTOS.least, wanted)),
      year: years.length > 0 ? Number(year) : undefined,
    });
  };
</script>

<FormModal
  title={$t('photo_book_make')}
  icon={mdiBookOpenPageVariantOutline}
  submitText={$t('photo_book_make')}
  onClose={() => onClose()}
  {onSubmit}
>
  <div class="ws-photo-book">
    {#if years.length > 0}
      <Field label={$t('year')}>
        <Select options={yearOptions} value={year} onChange={pickYear} />
      </Field>
    {/if}
    <Field label={$t('photo_book_title')}>
      <Input bind:value={title} />
    </Field>
    <Field label={$t('photo_book_photos')} description={$t('photo_book_photos_description')}>
      <NumberInput bind:value={photos} min={BOOK_PHOTOS.least} max={BOOK_PHOTOS.most} />
    </Field>
    <p class="ws-photo-book-note">{$t('photo_book_note')}</p>
  </div>
</FormModal>

<style>
  .ws-photo-book {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    margin-block: 0.5rem;
  }
  .ws-photo-book-note {
    font-size: var(--ws-text-meta);
    line-height: 1.5;
    color: var(--immich-ui-muted);
  }
</style>
