<script lang="ts">
  import SharedLinkExpiration from '$lib/components/SharedLinkExpiration.svelte';
  import {
    memoryVideoAspect,
    type MemoryPresentation,
    type MemoryShareMode,
  } from '$lib/components/memories/memory-sharing';
  import { filmVideos } from '$lib/managers/film-video-manager.svelte';
  import { asUrl, makeSharedLink, shareLinkExpiry } from '$lib/services/shared-link.service';
  import { copyToClipboard } from '$lib/utils';
  import { curator, type FilmRequest } from '$lib/utils/curator';
  import { SharedLinkType, type SharedLinkResponseDto } from '@immich/sdk';
  import { Button, Field, FormModal, Icon, Input, PasswordInput } from '@immich/ui';
  import { mdiCellphone, mdiContentCopy, mdiMonitor, mdiPlayCircleOutline, mdiShareVariant } from '@mdi/js';
  import { onDestroy, onMount } from 'svelte';
  import { t } from 'svelte-i18n';

  interface Props {
    memoryId: string;
    presentation: MemoryPresentation;
    getVideo: (aspect: number) => FilmRequest | undefined;
    initialMode?: MemoryShareMode;
    onClose: () => void;
  }

  let { memoryId, presentation, getVideo, initialMode = 'memory', onClose }: Props = $props();
  let mode = $state<MemoryShareMode>(initialMode);
  let expiresAt = $state<string | null>(shareLinkExpiry());
  let password = $state('');
  let busy = $state(false);
  let error = $state('');
  let link = $state<SharedLinkResponseDto>();
  let linkUrl = $state('');
  let canShare = $state(false);
  let closed = false;

  const choices = [
    {
      value: 'memory',
      icon: mdiPlayCircleOutline,
      title: 'memory_share_playable',
      detail: 'memory_share_playable_hint',
    },
    { value: 'portrait', icon: mdiCellphone, title: 'memory_share_portrait', detail: 'memory_share_portrait_hint' },
    { value: 'landscape', icon: mdiMonitor, title: 'memory_share_landscape', detail: 'memory_share_landscape_hint' },
  ] as const;

  const progress = $derived(
    filmVideos.items.find((item) => item.request.memoryId === memoryId && item.status === 'making'),
  );

  onMount(() => {
    filmVideos.shareDialogOpen = true;
    // eslint-disable-next-line tscompat/tscompat -- feature detected; unsupported browsers copy the link
    canShare = typeof navigator.share === 'function';
  });
  onDestroy(() => {
    closed = true;
    filmVideos.shareDialogOpen = false;
  });

  const prepareVideo = async () => {
    if (mode === 'memory') {
      throw new Error($t('memory_share_video_failed'));
    }
    const request = getVideo(memoryVideoAspect(mode));
    if (!request) {
      throw new Error($t('memory_share_video_failed'));
    }
    const label = `${presentation.title} · ${$t(mode === 'portrait' ? 'memory_share_portrait' : 'memory_share_landscape')}`;
    return filmVideos.prepare({ ...request, title: label, size: '720p' }, label);
  };

  const download = async () => {
    if (busy) {
      return;
    }
    busy = true;
    error = '';
    try {
      const item = await prepareVideo();
      if (!closed) {
        filmVideos.save(item);
      }
    } catch {
      error = $t('memory_share_video_failed');
    } finally {
      busy = false;
    }
  };

  const submit = async () => {
    if (busy) {
      return;
    }
    if (linkUrl) {
      if (canShare) {
        try {
          // eslint-disable-next-line tscompat/tscompat -- guarded by canShare
          await navigator.share({ title: presentation.title, url: linkUrl });
        } catch (error) {
          if ((error as Error).name !== 'AbortError') {
            await copyToClipboard(linkUrl);
          }
        }
      } else {
        await copyToClipboard(linkUrl);
      }
      return;
    }
    busy = true;
    error = '';
    try {
      let assetIds = presentation.assetIds;
      if (mode !== 'memory') {
        const item = await prepareVideo();
        if (closed) {
          return;
        }
        if (!item.assetId) {
          const kept = await curator.keepFilm(item.jobId!);
          item.assetId = kept.assetId;
        }
        assetIds = [item.assetId];
      }
      if (closed) {
        return;
      }
      link ??= await makeSharedLink({
        type: SharedLinkType.Individual,
        assetIds,
        description: presentation.title,
        expiresAt,
        password: password || undefined,
        allowUpload: false,
        allowDownload: mode !== 'memory',
        // Rendered MP4s have no source EXIF/GPS. Gallery requires this for MP4 downloads.
        showMetadata: mode !== 'memory',
      });
      if (!link) {
        throw new Error('link');
      }
      if (mode === 'memory') {
        await curator.shareMemory(memoryId, { linkId: link.id, key: link.key, presentation });
      }
      linkUrl = asUrl(link);
    } catch {
      error = $t('memory_share_failed');
    } finally {
      busy = false;
    }
  };
</script>

<FormModal
  title={$t('memory_share')}
  icon={mdiShareVariant}
  size="small"
  {onClose}
  onSubmit={submit}
  disabled={busy}
  submitText={linkUrl ? $t(canShare ? 'share_link' : 'copy_link') : $t(busy ? 'memory_share_preparing' : 'create_link')}
>
  {#if linkUrl}
    <p class="ws-memory-share-name">{presentation.title}</p>
    <p>{$t('memory_share_ready')}</p>
    <div class="ws-memory-share-result">
      <Field label={$t('share_link')}>
        <Input value={linkUrl} readonly />
      </Field>
      <Button variant="ghost" onclick={() => copyToClipboard(linkUrl)} aria-label={$t('copy_link')}>
        <Icon icon={mdiContentCopy} size="20" />
      </Button>
    </div>
    <a class="ws-memory-share-open" href={linkUrl} target="_blank" rel="noopener noreferrer"
      >{$t('memory_share_open')}</a
    >
  {:else}
    <p class="ws-memory-share-name">{presentation.title}</p>
    <fieldset class="ws-memory-share-choices" disabled={busy || !!link}>
      <legend class="sr-only">{$t('memory_share_format')}</legend>
      {#each choices as choice (choice.value)}
        <label class="ws-memory-share-choice" class:chosen={mode === choice.value}>
          <input type="radio" name="memory-share-format" value={choice.value} bind:group={mode} />
          <Icon icon={choice.icon} size="24" aria-hidden />
          <span><strong>{$t(choice.title)}</strong><small>{$t(choice.detail)}</small></span>
        </label>
      {/each}
    </fieldset>
    <fieldset class="ws-memory-share-options" disabled={busy || !!link}>
      <legend class="sr-only">{$t('memory_share_options')}</legend>
      <SharedLinkExpiration bind:expiresAt />
      <Field label={$t('password')} description={$t('shared_link_password_description')}>
        <PasswordInput bind:value={password} autocomplete="new-password" />
      </Field>
    </fieldset>
    {#if busy}
      <div class="ws-memory-share-progress" role="status" aria-live="polite">
        <p>{$t('memory_share_preparing')}{progress ? ` · ${Math.round(progress.progress * 100)}%` : ''}</p>
        <progress max="1" value={progress?.progress}></progress>
      </div>
    {/if}
    {#if mode !== 'memory'}
      <Button variant="ghost" disabled={busy || !!link} onclick={download}>{$t('memory_share_download')}</Button>
    {/if}
  {/if}
  {#if error}<p class="ws-memory-share-error" role="alert">{error}</p>{/if}
</FormModal>

<style>
  .ws-memory-share-name {
    font-weight: 600;
    margin-bottom: 1rem;
  }
  .ws-memory-share-choices {
    border-block: 1px solid var(--ws-hairline);
    margin-bottom: 1.5rem;
  }
  .ws-memory-share-choice {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 1rem 0.5rem;
    cursor: pointer;
    min-height: 4.75rem;
  }
  .ws-memory-share-choice + .ws-memory-share-choice {
    border-top: 1px solid var(--ws-hairline);
  }
  .ws-memory-share-choice input {
    accent-color: currentColor;
    width: 1rem;
    height: 1rem;
  }
  .ws-memory-share-choice strong,
  .ws-memory-share-choice small {
    display: block;
  }
  .ws-memory-share-choice small {
    font-size: 0.875rem;
    line-height: 1.5;
    margin-top: 0.125rem;
  }
  .ws-memory-share-choice.chosen {
    background: color-mix(in srgb, currentColor 6%, transparent);
  }
  .ws-memory-share-choice:focus-within {
    outline: 2px solid var(--ws-accent);
    outline-offset: -2px;
  }
  .ws-memory-share-options {
    display: grid;
    gap: 1rem;
    margin-block: 1rem 1.5rem;
  }
  fieldset:disabled {
    opacity: 0.65;
  }
  .ws-memory-share-progress {
    margin-block: 1rem;
  }
  .ws-memory-share-progress progress {
    width: 100%;
    height: 0.25rem;
    accent-color: currentColor;
  }
  .ws-memory-share-error {
    color: var(--ws-danger);
    margin-top: 1rem;
  }
  .ws-memory-share-result {
    display: flex;
    gap: 0.5rem;
    align-items: end;
    margin-block: 1.25rem;
  }
  .ws-memory-share-result :global(.field) {
    flex: 1;
    min-width: 0;
  }
  .ws-memory-share-open {
    display: inline-flex;
    align-items: center;
    min-height: 44px;
    text-decoration: underline;
    text-underline-offset: 0.2em;
  }
</style>
