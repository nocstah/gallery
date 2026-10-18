<script lang="ts">
  import AlbumViewer from '$lib/components/album-page/AlbumViewer.svelte';
  import IndividualSharedViewer from '$lib/components/share-page/IndividualSharedViewer.svelte';
  import { assetViewerManager } from '$lib/managers/asset-viewer-manager.svelte';
  import { authManager } from '$lib/managers/auth-manager.svelte';
  import { setSharedLink } from '$lib/utils';
  import { handleError } from '$lib/utils/handle-error';
  import { navigate } from '$lib/utils/navigation';
  import {
    isHttpError,
    sharedLinkLogin,
    SharedLinkType,
    type AssetResponseDto,
    type SharedLinkResponseDto,
  } from '@immich/sdk';
  import { PasswordInput } from '@immich/ui';
  import { onDestroy, tick } from 'svelte';
  import { t } from 'svelte-i18n';

  type Props = {
    data: {
      meta: {
        title: string;
        description?: string;
        imageUrl?: string;
      };

      sharedLink?: SharedLinkResponseDto;
      key?: string;
      slug?: string;
      asset?: AssetResponseDto;
      passwordRequired?: boolean;
    };
  };

  const { data }: Props = $props();

  let { sharedLink, passwordRequired, key, slug, meta } = $state(data);
  let { title, description } = $state(meta);
  let isOwned = $derived(authManager.authenticated && authManager.user.id === sharedLink?.userId);
  let password = $state('');
  // Local Omarchy layer: a wrong password is said under the field (the server's 401 "Invalid password"), not in a
  // toast that leaves the field looking accepted; and one press opens the link once
  let wrongPassword = $state(false);
  let unlocking = $state(false);

  if (passwordRequired) {
    assetViewerManager.showAssetViewer(false);
  }

  const passwordField = () => document.querySelector<HTMLInputElement>('#shared-link-password');

  const handlePasswordSubmit = async () => {
    if (unlocking) {
      return;
    }
    if (!password) {
      passwordField()?.focus();
      return;
    }
    unlocking = true;
    wrongPassword = false;
    try {
      sharedLink = await sharedLinkLogin({ key, slug, sharedLinkLoginDto: { password } });
      setSharedLink(sharedLink);
      passwordRequired = false;
      title = (sharedLink.album ? sharedLink.album.albumName : $t('public_share')) + ' - Immich';
      description =
        sharedLink.description ||
        $t('shared_photos_and_videos_count', { values: { assetCount: sharedLink.assets.length } });
      await tick();
      await navigate(
        { targetRoute: 'current', assetId: null, assetGridRouteSearchParams: assetViewerManager.gridScrollTarget },
        { forceNavigate: true, replaceState: true },
      );
    } catch (error) {
      if (isHttpError(error) && error.status === 401) {
        wrongPassword = true;
        // back in the field with what was typed selected, so it can be typed again at once
        passwordField()?.select();
      } else {
        handleError(error, $t('errors.unable_to_get_shared_link'));
      }
    } finally {
      unlocking = false;
    }
  };

  const onsubmit = async (event: Event) => {
    event.preventDefault();
    await handlePasswordSubmit();
  };

  onDestroy(() => {
    setSharedLink(undefined);
  });
</script>

<svelte:head>
  <title>{title}</title>
  <meta name="description" content={description} />
</svelte:head>
{#if passwordRequired}
  <!-- Local Omarchy layer: the password prompt in the Empty State's grammar (DESIGN.md, Error pages), on its own on the
       ground like a link that ended, with the same words as the public link page's: what the link needs, where the
       password comes from, a field with its label, and Open. Upstream: "Password Required" in the accent over a
       field whose only label was its placeholder, Submit, and Immich's bar. -->
  <main class="ws-standalone">
    <div class="ws-empty">
      <h1 class="ws-empty-title">{$t('shared_link_password_title')}</h1>
      <p class="ws-empty-body">{$t('shared_link_password_body')}</p>
      <form class="ws-link-password" novalidate {onsubmit}>
        <label class="ws-link-password-label" for="shared-link-password">{$t('password')}</label>
        <div class="ws-link-password-row">
          <PasswordInput
            id="shared-link-password"
            autocomplete="off"
            autofocus
            bind:value={password}
            aria-invalid={wrongPassword}
            aria-describedby={wrongPassword ? 'shared-link-password-wrong' : undefined}
            oninput={() => (wrongPassword = false)}
          />
          <button type="submit" class="ws-empty-action">
            {$t('shared_link_password_open')}
          </button>
        </div>
        {#if wrongPassword}
          <p class="ws-link-password-wrong" id="shared-link-password-wrong" role="alert">
            {$t('shared_link_password_wrong')}
          </p>
        {/if}
      </form>
    </div>
  </main>
{/if}

{#if !passwordRequired && sharedLink?.type === SharedLinkType.Album}
  <AlbumViewer {sharedLink} />
{/if}
{#if !passwordRequired && sharedLink?.type === SharedLinkType.Individual}
  <div class="immich-scrollbar">
    <IndividualSharedViewer {sharedLink} {isOwned} />
  </div>
{/if}
