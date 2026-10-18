<script lang="ts">
  // Local Omarchy layer: saving the Photos page's search as a smart album (Curator, curator/smart.py), or changing the
  // search behind one. Shows how many photos match as the settings change, the newest few, and for typed words the
  // weakest matches still in, so the cut can be set by eye.
  import { getAssetMediaUrl } from '$lib/utils';
  import {
    curator,
    type SmartAlbum,
    type SmartPreview,
    type SmartRule,
    type SmartStrictness,
  } from '$lib/utils/curator';
  import { AssetMediaSize } from '@immich/sdk';
  import { Field, FormModal, HelperText, Input, toastManager } from '@immich/ui';
  import { mdiAutoFix } from '@mdi/js';
  import { t } from 'svelte-i18n';

  type Props = {
    /** the search as it stands, without strictness */
    rule: Omit<SmartRule, 'strictness'>;
    suggestedName: string;
    /** the smart album being changed; a new one is made without */
    editing?: SmartAlbum;
    onClose: (saved?: SmartAlbum) => void;
  };

  let { rule, suggestedName, editing, onClose }: Props = $props();

  let name = $state(editing?.name ?? suggestedName);
  let strictness = $state<SmartStrictness>(editing?.rule.strictness ?? 'normal');
  let preview = $state<SmartPreview>();
  let previewError = $state<string>();
  let saving = $state(false);
  const typed = $derived(!!rule.query?.trim());
  const levels: SmartStrictness[] = ['loose', 'normal', 'strict'];

  $effect(() => {
    const controller = new AbortController();
    const wanted: SmartRule = { ...rule, strictness };
    previewError = undefined;
    curator
      .smartPreview(wanted, controller.signal)
      .then((result) => (preview = result))
      .catch((error: Error) => {
        if (!controller.signal.aborted) {
          previewError = error.message;
        }
      });
    return () => controller.abort();
  });

  const thumb = (id: string) => getAssetMediaUrl({ id, size: AssetMediaSize.Thumbnail });

  const onSubmit = async () => {
    if (!name.trim() || saving) {
      return;
    }
    saving = true;
    try {
      const wanted: SmartRule = { ...rule, strictness };
      const saved = editing
        ? await curator.smartUpdate(editing.id, wanted)
        : await curator.smartCreate(name.trim(), wanted);
      toastManager.success(editing ? $t('smart_album_updated') : $t('smart_album_created'));
      onClose(saved);
    } catch (error) {
      toastManager.danger((error as Error).message);
    } finally {
      saving = false;
    }
  };
</script>

<FormModal
  title={editing ? $t('smart_album_update') : $t('smart_album_save')}
  size="medium"
  icon={mdiAutoFix}
  submitText={editing ? $t('smart_album_update') : $t('smart_album_save')}
  disabled={saving || !name.trim() || !preview}
  onClose={() => onClose()}
  {onSubmit}
>
  <div class="smart-modal">
    {#if !editing}
      <Field label={$t('name')} required>
        <Input bind:value={name} />
      </Field>
    {/if}

    {#if typed}
      <Field label={$t('smart_album_strictness')}>
        <div class="ws-seg" role="group" aria-label={$t('smart_album_strictness')}>
          {#each levels as level (level)}
            <button type="button" aria-pressed={strictness === level} onclick={() => (strictness = level)}>
              {$t(`smart_album_${level}`)}
            </button>
          {/each}
        </div>
      </Field>
    {/if}

    <p class="count" aria-live="polite">
      {#if previewError}
        <span class="error">{previewError}</span>
      {:else if preview}
        {preview.count > 0 ? $t('smart_album_count', { values: { count: preview.count } }) : $t('smart_album_no_match')}
      {:else}
        &nbsp;
      {/if}
    </p>

    {#if preview && preview.count > 0}
      <div class="strip-label">{$t('smart_album_newest')}</div>
      <div class="strip">
        {#each preview.newest as id (id)}
          <img src={thumb(id)} alt="" loading="lazy" />
        {/each}
      </div>
      {#if typed && preview.weakest.length > 0}
        <div class="strip-label">{$t('smart_album_weakest')}</div>
        <div class="strip">
          {#each preview.weakest as id (id)}
            <img src={thumb(id)} alt="" loading="lazy" />
          {/each}
        </div>
      {/if}
    {/if}

    <HelperText>{$t('smart_album_help')}</HelperText>
  </div>
</FormModal>

<style>
  .smart-modal {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    margin-block: 0.5rem;
  }
  .ws-seg {
    width: fit-content;
  }
  .count {
    font-size: 0.875rem;
    font-weight: 600;
    min-height: 1.25rem;
  }
  .error {
    color: var(--ws-danger);
    font-weight: 500;
  }
  .strip-label {
    font-size: 0.75rem;
    opacity: 0.7;
    margin-bottom: -0.4rem;
  }
  .strip {
    display: grid;
    grid-template-columns: repeat(8, minmax(0, 1fr));
    gap: 0.25rem;
  }
  .strip img {
    aspect-ratio: 1;
    width: 100%;
    object-fit: cover;
    border-radius: 0.375rem;
  }
  @media (max-width: 640px) {
    .strip {
      grid-template-columns: repeat(4, minmax(0, 1fr));
    }
  }
</style>
