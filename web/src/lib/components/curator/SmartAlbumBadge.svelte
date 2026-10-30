<script lang="ts">
  // Local Omarchy layer: on a smart album's page (Curator, curator/smart.py), what it is and the two things to do with
  // it: change the search behind it on the Photos page, or stop it updating and keep it as an ordinary album. Left
  // out for ordinary albums and when Curator does not answer, and not asked for where this library's Curator keeps no
  // smart albums (gallery/libraries). A media type's album (Selfies, Panoramas) has no Photos page search behind it, so
  // it only offers to stop. An album of fewer than all of its people together says how many ("at least 2 of them").
  import { goto } from '$app/navigation';
  import { curatorOffers } from '$lib/gallery/libraries/library-context.svelte';
  import { curator, type SmartAlbum } from '$lib/utils/curator';
  import { Icon, modalManager, toastManager } from '@immich/ui';
  import { mdiAutoFix } from '@mdi/js';
  import { t } from 'svelte-i18n';

  interface Props {
    albumId: string;
  }

  let { albumId }: Props = $props();

  let smart = $state<SmartAlbum | null>(null);
  // an album of fewer than all of its people together: how many of them each photo holds (Curator keeps it only then)
  const atLeast = $derived(smart?.rule.people_at_least);

  $effect(() => {
    const asked = albumId;
    smart = null;
    if (!curatorOffers('smart')) {
      return;
    }
    curator
      .smartForAlbum(asked)
      .then((answer) => {
        if (asked === albumId) {
          smart = answer;
        }
      })
      .catch(() => undefined);
  });

  const editSearch = async () => {
    if (!smart) {
      return;
    }
    const url = new URL(smart.rule.filters.url ?? '/photos', location.origin);
    url.searchParams.set('smart', String(smart.id));
    await goto(url.pathname + url.search);
  };

  const stop = async () => {
    if (!smart) {
      return;
    }
    const confirmed = await modalManager.showDialog({
      title: $t('smart_album_stop'),
      prompt: $t('smart_album_stop_confirm'),
    });
    if (!confirmed) {
      return;
    }
    try {
      await curator.smartStop(smart.id);
      smart = null;
      toastManager.success($t('smart_album_stopped'));
    } catch (error) {
      toastManager.danger((error as Error).message);
    }
  };
</script>

{#if smart}
  <div class="smart-badge">
    <span
      class="label bg-immich-primary/10 text-immich-primary dark:bg-immich-dark-primary/10 dark:text-immich-dark-primary"
    >
      <Icon icon={mdiAutoFix} size="15" />
      {$t('smart_album_badge')}
      {#if smart.rule.query}
        <span class="query">“{smart.rule.query}”</span>
      {/if}
      {#if atLeast}
        <span class="people">· {$t('smart_album_badge_people', { values: { count: atLeast } })}</span>
      {/if}
    </span>
    {#if !smart.rule.media}
      <button type="button" onclick={editSearch}>{$t('smart_album_edit')}</button>
    {/if}
    <button type="button" onclick={stop}>{$t('smart_album_stop')}</button>
  </div>
{/if}

<style>
  .smart-badge {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.25rem 0.5rem;
    margin-block: 0.75rem 0.25rem;
    font-size: 0.75rem;
  }
  .label {
    display: inline-flex;
    align-items: center;
    gap: 0.375rem;
    padding: 0.25rem 0.75rem 0.25rem 0.625rem;
    border-radius: var(--ws-radius);
    font-weight: 600;
  }
  .query,
  .people {
    font-weight: 500;
    opacity: 0.8;
  }
  button {
    padding: 0.25rem 0.625rem;
    border-radius: var(--ws-radius);
    font-weight: 600;
    opacity: 0.75;
  }
  button:hover {
    opacity: 1;
    background: color-mix(in srgb, currentColor 8%, transparent);
  }
</style>
