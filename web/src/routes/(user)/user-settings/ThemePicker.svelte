<script lang="ts">
  // Local Omarchy layer: the theme picker (lib/theme). "Follow Omarchy" keeps Gallery in step with the desktop's
  // theme; any other card wears that theme in this browser, at once, whatever the desktop does. Themes can be
  // installed from a .json file or a URL (checked field by field: colours, numbers and names only) and downloaded
  // to share.
  import { CHROME_MODES, chrome } from '$lib/theme/chrome.svelte';
  import { swatches, type GalleryTheme } from '$lib/theme/derive';
  import { FOLLOW_OMARCHY, galleryThemes } from '$lib/theme/theme-manager.svelte';
  import { Icon, toastManager } from '@immich/ui';
  import { mdiCheck, mdiDownload, mdiMonitorShimmer, mdiTrashCanOutline, mdiUpload } from '@mdi/js';
  import { onMount } from 'svelte';
  import { t } from 'svelte-i18n';

  type Filter = 'all' | 'dark' | 'light' | 'installed';
  let filter = $state<Filter>('all');
  let search = $state('');
  let url = $state('');
  let fileInput = $state<HTMLInputElement>();

  onMount(() => {
    void galleryThemes.load();
  });

  const shown = $derived(
    galleryThemes.all.filter(({ theme, builtIn }) => {
      if (filter === 'installed' && builtIn) {
        return false;
      }
      if ((filter === 'dark' || filter === 'light') && theme.mode !== filter) {
        return false;
      }
      return !search.trim() || theme.name.toLowerCase().includes(search.trim().toLowerCase());
    }),
  );

  const choose = (id: string) => galleryThemes.choose(id);

  const installed = (theme: GalleryTheme) => {
    toastManager.success($t('theme_installed', { values: { name: theme.name } }));
    galleryThemes.choose(theme.id);
  };

  const fromFile = async (event: Event) => {
    const file = (event.currentTarget as HTMLInputElement).files?.[0];
    if (!file) {
      return;
    }
    try {
      installed(galleryThemes.install(JSON.parse(await file.text())));
    } catch (error) {
      toastManager.danger($t('theme_install_failed', { values: { reason: (error as Error).message } }));
    } finally {
      (event.currentTarget as HTMLInputElement).value = '';
    }
  };

  const fromUrl = async () => {
    const address = url.trim();
    if (!/^https?:\/\//.test(address)) {
      return;
    }
    try {
      const response = await fetch(address);
      installed(galleryThemes.install(await response.json()));
      url = '';
    } catch (error) {
      toastManager.danger($t('theme_install_failed', { values: { reason: (error as Error).message } }));
    }
  };

  const download = (theme: GalleryTheme) => {
    const link = Object.assign(document.createElement('a'), {
      href: URL.createObjectURL(galleryThemes.file(theme)),
      download: `${theme.id}.gallery-theme.json`,
    });
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 10_000);
  };

  const filters: Filter[] = ['all', 'dark', 'light', 'installed'];
</script>

<section class="themes">
  <div class="themes-chrome">
    <span class="themes-chrome-label">{$t('chrome_material')}</span>
    <div class="ws-seg" role="group" aria-label={$t('chrome_material')}>
      {#each CHROME_MODES as mode (mode)}
        <button type="button" aria-pressed={chrome.mode === mode} onclick={() => chrome.choose(mode)}>
          {$t(`chrome_${mode.replace('-', '_')}`)}
        </button>
      {/each}
    </div>
  </div>

  <div class="themes-bar">
    <div class="ws-seg" role="group" aria-label={$t('theme')}>
      {#each filters as value (value)}
        <button type="button" aria-pressed={filter === value} onclick={() => (filter = value)}>
          {$t(`theme_filter_${value}`)}
        </button>
      {/each}
    </div>
    <input class="themes-search" type="search" placeholder={$t('theme_search')} bind:value={search} />
  </div>

  <div class="themes-grid">
    {#if filter === 'all' && !search.trim()}
      <button
        type="button"
        class="theme-card is-follow"
        aria-pressed={galleryThemes.current === FOLLOW_OMARCHY}
        onclick={() => choose(FOLLOW_OMARCHY)}
      >
        <span class="theme-preview follow">
          <Icon icon={mdiMonitorShimmer} size="34" />
        </span>
        <span class="theme-name">
          {$t('theme_follow_omarchy')}
          {#if galleryThemes.current === FOLLOW_OMARCHY}<Icon icon={mdiCheck} size="16" />{/if}
        </span>
        <span class="theme-meta">{$t('theme_follow_omarchy_description')}</span>
      </button>
    {/if}

    {#each shown as { theme, builtIn } (theme.id)}
      {@const colours = swatches(theme)}
      <div class="theme-card" aria-pressed={galleryThemes.current === theme.id}>
        <button type="button" class="theme-pick" onclick={() => choose(theme.id)} aria-label={theme.name}>
          <span class="theme-preview" style:background={colours.surface}>
            {#if theme.preview}<img src={theme.preview} alt="" loading="lazy" />{/if}
            <span class="theme-swatches" aria-hidden="true">
              <span style:background={colours.surface}></span>
              <span style:background={colours.chrome}></span>
              <span style:background={colours.border}></span>
              <span style:background={colours.text}></span>
              <span style:background={colours.accent}></span>
            </span>
          </span>
          <span class="theme-name">
            {theme.name}
            {#if galleryThemes.current === theme.id}<Icon icon={mdiCheck} size="16" />{/if}
          </span>
          <span class="theme-meta">
            {$t(theme.mode === 'light' ? 'theme_light' : 'theme_dark')}{theme.author ? ` · ${theme.author}` : ''}
          </span>
        </button>
        <span class="theme-tools">
          <button type="button" title={$t('download')} aria-label={$t('download')} onclick={() => download(theme)}>
            <Icon icon={mdiDownload} size="16" />
          </button>
          {#if !builtIn}
            <button
              type="button"
              title={$t('remove')}
              aria-label={$t('remove')}
              onclick={() => galleryThemes.uninstall(theme.id)}
            >
              <Icon icon={mdiTrashCanOutline} size="16" />
            </button>
          {/if}
        </span>
      </div>
    {/each}
  </div>

  <div class="themes-install">
    <button type="button" class="ws-btn-quiet" onclick={() => fileInput?.click()}>
      <Icon icon={mdiUpload} size="16" />
      {$t('theme_install_file')}
    </button>
    <input bind:this={fileInput} type="file" accept=".json,application/json" hidden onchange={fromFile} />
    <form
      class="themes-url"
      onsubmit={(event) => {
        event.preventDefault();
        void fromUrl();
      }}
    >
      <input type="url" placeholder={$t('theme_install_url')} bind:value={url} />
      <button type="submit" class="ws-btn-quiet" disabled={!/^https?:\/\//.test(url.trim())}>{$t('install')}</button>
    </form>
  </div>
</section>

<style>
  .themes {
    display: grid;
    gap: 1rem;
  }
  .themes-chrome {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem 1rem;
    align-items: center;
    padding-bottom: 1rem;
    border-bottom: 1px solid var(--ws-hairline);
  }
  .themes-chrome-label {
    font-size: 0.9rem;
    font-weight: 600;
    color: var(--immich-ui-dark);
  }
  .themes-chrome .ws-seg {
    margin-inline-start: 0;
  }
  .themes-bar {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
    align-items: center;
    justify-content: space-between;
  }
  .themes-search,
  .themes-url input {
    min-width: 0;
    padding: 0.45rem 0.75rem;
    border: 1px solid var(--immich-ui-default-border);
    border-radius: max(var(--ws-radius, 0px), 6px);
    background: transparent;
    font-size: 0.85rem;
  }
  .themes-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(11.5rem, 1fr));
    gap: 0.75rem;
  }
  .theme-card {
    position: relative;
    display: grid;
    gap: 0.2rem;
    padding: 0.4rem 0.4rem 0.55rem;
    border: 1px solid var(--immich-ui-default-border);
    border-radius: max(var(--ws-radius, 0px), 8px);
    text-align: start;
    transition: border-color 0.15s;
  }
  .theme-card[aria-pressed='true'] {
    border-color: var(--ws-accent);
    box-shadow: 0 0 0 1px var(--ws-accent);
  }
  .theme-pick {
    display: grid;
    gap: 0.2rem;
    text-align: start;
  }
  .theme-preview {
    position: relative;
    display: grid;
    place-items: center;
    aspect-ratio: 16 / 9;
    overflow: hidden;
    border-radius: max(var(--ws-radius, 0px), 5px);
  }
  .theme-preview.follow {
    background: linear-gradient(135deg, var(--immich-ui-gray), var(--gallery-chrome, var(--immich-ui-light)));
    color: var(--ws-accent);
  }
  .theme-preview img {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .theme-swatches {
    position: absolute;
    inset-inline: 0;
    bottom: 0;
    display: flex;
    height: 0.6rem;
  }
  .theme-swatches span {
    flex: 1;
  }
  .theme-swatches span:last-child {
    flex: 2;
  }
  .theme-name {
    display: flex;
    gap: 0.3rem;
    align-items: center;
    margin-top: 0.3rem;
    font-size: 0.85rem;
    font-weight: 600;
    color: var(--immich-ui-dark);
  }
  .theme-name :global(svg) {
    color: var(--ws-accent);
  }
  .theme-meta {
    font-size: var(--ws-text-data);
    color: var(--immich-ui-muted);
  }
  .theme-tools {
    position: absolute;
    top: 0.7rem;
    inset-inline-end: 0.7rem;
    display: flex;
    gap: 0.25rem;
    opacity: 0;
    transition: opacity 0.15s;
  }
  .theme-card:hover .theme-tools,
  .theme-card:focus-within .theme-tools {
    opacity: 1;
  }
  .theme-tools button {
    display: grid;
    place-items: center;
    padding: 0.3rem;
    border-radius: 999px;
    background: rgb(0 0 0 / 0.55);
    color: #fff;
  }
  .themes-install {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
    align-items: center;
  }
  .themes-install .ws-btn-quiet {
    display: inline-flex;
    gap: 0.4rem;
    align-items: center;
  }
  .themes-url {
    display: flex;
    flex: 1;
    gap: 0.5rem;
    min-width: 16rem;
  }
  .themes-url input {
    flex: 1;
  }
</style>
