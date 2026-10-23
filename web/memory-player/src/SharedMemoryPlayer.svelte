<script lang="ts">
  import MemoryFilm from '../../src/lib/components/memories/film/MemoryFilm.svelte';
  import type { FilmMedia } from '../../src/lib/components/memories/film/film-media';
  import type { MemoryPresentation } from '../../src/lib/components/memories/memory-sharing';
  import type { MemoryTrack } from '../../src/lib/utils/curator';
  import type { AssetResponseDto } from '@immich/sdk';
  import { Icon } from '@immich/ui';
  import { mdiArrowLeft, mdiPlay, mdiRefresh } from '@mdi/js';
  import { onMount } from 'svelte';
  import { t } from 'svelte-i18n';

  type SharedMemory = Omit<MemoryPresentation, 'assetIds' | 'trackIds'> & {
    memoryId: string;
    // The read-only renderer uses only the explicitly projected public fields, never private asset helpers.
    assets: AssetResponseDto[];
    tracks: MemoryTrack[];
  };

  const key = encodeURIComponent(decodeURIComponent(location.pathname.split('/', 3)[2] ?? ''));
  const base = `/memory/${key}`;
  let memory = $state<SharedMemory>();
  let loading = $state(true);
  let passwordRequired = $state(false);
  let password = $state('');
  let error = $state('');
  let view = $state<'cover' | 'film' | 'grid'>('cover');
  let assetId = $state('');
  let reducedMotion = $state(false);
  let paused = $state(false);

  const media: FilmMedia = {
    preview: (id) => `${base}/assets/${encodeURIComponent(id)}/thumbnail?size=preview`,
    thumbnail: (id) => `${base}/assets/${encodeURIComponent(id)}/thumbnail?size=thumbnail`,
    video: (id) => `${base}/assets/${encodeURIComponent(id)}/video`,
    music: (src) => src,
    alt: (asset) => $t(asset.type === 'VIDEO' ? 'video' : 'image'),
  };

  const load = async () => {
    loading = true;
    error = '';
    try {
      const response = await fetch(`${base}/data`, { cache: 'no-store' });
      if (response.status === 401) {
        passwordRequired = true;
        return;
      }
      if (!response.ok) {
        throw new Error(response.status === 404 || response.status === 410 ? 'unavailable' : 'load');
      }
      memory = await response.json();
      assetId = memory!.cover ?? memory!.assets[0].id;
      passwordRequired = false;
      document.title = `${memory!.title} · Gallery`;
    } catch (error_) {
      error = $t((error_ as Error).message === 'unavailable' ? 'memory_share_unavailable' : 'memory_share_load_failed');
    } finally {
      loading = false;
    }
  };

  const unlock = async (event: SubmitEvent) => {
    event.preventDefault();
    loading = true;
    error = '';
    try {
      const response = await fetch(`${base}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      if (!response.ok) {
        throw new Error('password');
      }
      password = '';
      await load();
    } catch {
      error = $t('memory_share_password_failed');
    } finally {
      loading = false;
    }
  };

  onMount(() => {
    void load();
    const query = matchMedia('(prefers-reduced-motion: reduce)');
    const change = () => (reducedMotion = query.matches);
    change();
    query.addEventListener('change', change);
    return () => query.removeEventListener('change', change);
  });

  const play = (id?: string) => {
    assetId = id ?? memory!.cover ?? memory!.assets[0].id;
    paused = false;
    view = 'film';
  };
</script>

{#if memory}
  {#if view === 'cover'}
    <main class="memory-cover">
      <img src={media.preview(memory.cover ?? memory.assets[0].id)} alt="" />
      <div class="memory-cover-shade"></div>
      <div class="memory-cover-content">
        <h1>{memory.name}</h1>
        <p>{memory.line}</p>
        <button type="button" class="memory-play" onclick={() => play()}
          ><Icon icon={mdiPlay} size="24" />{$t('memory_share_play')}</button
        >
      </div>
    </main>
  {:else}
    <div hidden={view !== 'film'}>
      <MemoryFilm
        {media}
        language={memory.language}
        {reducedMotion}
        memory={{ id: memory.memoryId, assets: memory.assets }}
        {assetId}
        active={view === 'film'}
        name={memory.name}
        line={memory.line}
        title={memory.title}
        cover={memory.cover}
        focus={memory.focus}
        settled={true}
        story={memory.story}
        storyCues={memory.storyCues}
        tracks={memory.tracks}
        photoSeconds={memory.photoSeconds}
        bind:paused
        onClose={() => (view = 'cover')}
        onAllPhotos={() => (view = 'grid')}
      />
    </div>
    {#if view === 'grid'}
      <main class="memory-grid-page">
        <header>
          <button type="button" class="memory-icon-button" aria-label={$t('back')} onclick={() => (view = 'film')}
            ><Icon icon={mdiArrowLeft} size="24" /></button
          >
          <h1>{memory.title}</h1>
          <button type="button" class="memory-play" onclick={() => play()}
            ><Icon icon={mdiPlay} size="20" />{$t('memory_share_play')}</button
          >
        </header>
        <div class="memory-grid">
          {#each memory.assets as asset (asset.id)}
            <button type="button" aria-label={media.alt(asset)} onclick={() => play(asset.id)}>
              <img src={media.preview(asset.id)} alt={media.alt(asset)} loading="lazy" />
              {#if asset.type === 'VIDEO'}<span><Icon icon={mdiPlay} size="24" /></span>{/if}
            </button>
          {/each}
        </div>
      </main>
    {/if}
  {/if}
{:else}
  <main class="memory-access">
    {#if passwordRequired}
      <form onsubmit={unlock}>
        <h1>{$t('memory_share_password_title')}</h1>
        <label for="memory-password">{$t('password')}</label>
        <input
          id="memory-password"
          type="password"
          autocomplete="current-password"
          bind:value={password}
          required
          disabled={loading}
        />
        <button type="submit" class="memory-play" disabled={loading}
          >{$t(loading ? 'loading' : 'memory_share_unlock')}</button
        >
      </form>
    {:else if loading}
      <p role="status">{$t('loading')}</p>
    {:else if error}
      <h1>{$t('memory_share_unavailable_title')}</h1>
      <button type="button" class="memory-play" onclick={load}><Icon icon={mdiRefresh} size="20" />{$t('retry')}</button
      >
    {/if}
    {#if error}<p role="alert">{error}</p>{/if}
  </main>
{/if}
