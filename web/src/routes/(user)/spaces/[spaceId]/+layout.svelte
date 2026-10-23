<script lang="ts">
  import { goto, invalidateAll } from '$app/navigation';
  import { page } from '$app/state';
  import UserPageLayout from '$lib/components/layouts/UserPageLayout.svelte';
  import ButtonContextMenu from '$lib/components/shared-components/context-menu/ButtonContextMenu.svelte';
  import MenuOption from '$lib/components/shared-components/context-menu/MenuOption.svelte';
  import SpaceTabs from '$lib/components/spaces/space-tabs.svelte';
  import { authManager } from '$lib/managers/auth-manager.svelte';
  import { spaceUiManager } from '$lib/managers/space-ui-manager.svelte';
  import SpaceEditModal from '$lib/modals/SpaceEditModal.svelte';
  import SpaceHideFromTimelineConfirmModal from '$lib/modals/SpaceHideFromTimelineConfirmModal.svelte';
  import { Route } from '$lib/route';
  import { handleError } from '$lib/utils/handle-error';
  import {
    bulkAddAssets,
    getTimelineHidePreview,
    removeMember,
    removeSpace,
    SharedSpaceRole,
    updateMemberPreferences,
    updateMemberTimeline,
    updateSpace,
  } from '@immich/sdk';
  import { Button, IconButton, modalManager, toastManager } from '@immich/ui';
  import {
    mdiAccountPlusOutline,
    mdiArrowLeft,
    mdiDeleteOutline,
    mdiDotsVertical,
    mdiExitToApp,
    mdiEyeOffOutline,
    mdiEyeOutline,
    mdiFaceRecognition,
    mdiImageEditOutline,
    mdiImageMultipleOutline,
    mdiImagePlusOutline,
    mdiPaw,
    mdiPencilOutline,
  } from '@mdi/js';
  import type { Snippet } from 'svelte';
  import { t } from 'svelte-i18n';
  import type { LayoutData } from './$types';

  interface Props {
    data: LayoutData;
    children?: Snippet;
  }

  let { data, children }: Props = $props();

  // Local Omarchy layer: SvelteKit hands this layout the next page's data for a moment before it unmounts it (leaving
  // the Space through Photos in the sidebar), so everything here keeps reading the Space's own data meanwhile.
  let kept: LayoutData | undefined;
  const current = $derived.by(() => {
    if (data.space) {
      kept = data;
    }
    return kept ?? data;
  });
  const space = $derived(current.space);
  const members = $derived(current.members);
  const base = $derived(`/spaces/${space.id}`);

  const currentMember = $derived(members.find((m) => m.userId === authManager.user.id));
  const isOwner = $derived(currentMember?.role === SharedSpaceRole.Owner);
  const isEditor = $derived(
    currentMember?.role === SharedSpaceRole.Owner || currentMember?.role === SharedSpaceRole.Editor,
  );
  const showInTimeline = $derived(currentMember?.showInTimeline ?? true);
  const sharePersonMetadata = $derived(currentMember?.sharePersonMetadata ?? true);

  // L16: departing members' own albums are auto-unlinked on leave (cleanupDepartingMemberAlbums) —
  // warn upfront when the current member has any, so leaving isn't a surprise for the space's
  // other members.
  const hasOwnLinkedAlbums = $derived(current.linkedAlbums.some((album) => album.addedById === authManager.user.id));

  // A detail route (person or album) suppresses the tabs; it keeps its own back nav.
  const suffix = $derived(page.url.pathname.slice(base.length));
  const isDetailRoute = $derived(/^\/(people|albums)\/[^/]+/.test(suffix));
  const showChrome = $derived(!isDetailRoute && !spaceUiManager.chromeHidden);

  // Local Omarchy layer ("spaces library looks like it could use some impeccable redesign"): no cover over the page;
  // the Space's name and its sections share the one bar. A Space of one (Library, where the albums live) shows only
  // what means something to one person, and with albums it opens on them (its index route redirects there, see
  // [[photos=photos]]/+page.ts), so its Photos tab, and every intent that needs the photos, goes to /photos.
  const personal = $derived(members.length <= 1);
  const albumsFirst = $derived(personal && current.linkedAlbums.length > 0);
  const photosPath = $derived(albumsFirst ? `${base}/photos` : base);
  const onPhotos = $derived(page.url.pathname === base || page.url.pathname.startsWith(`${base}/photos`));

  const handleChangeCover = () => {
    spaceUiManager.requestChangeCover();
    if (!onPhotos) {
      void goto(photosPath);
    }
  };

  const handleEditSpace = async () => {
    const updated = await modalManager.show(SpaceEditModal, { space });
    if (updated) {
      await invalidateAll();
    }
  };

  const handleAddPhotos = () => {
    spaceUiManager.requestAddPhotos();
    if (!onPhotos) {
      void goto(photosPath);
    }
  };

  const handleToggleTimeline = async () => {
    try {
      // Unhiding needs no confirmation — only hiding removes photos from the caller's timeline,
      // so only that direction gets a dialog stating a count (§8).
      if (showInTimeline) {
        const { hiddenAssetCount, retainedAssetCount } = await getTimelineHidePreview({ id: space.id });
        const confirmed = await modalManager.show(SpaceHideFromTimelineConfirmModal, {
          spaceName: space.name,
          count: hiddenAssetCount,
          retainedCount: retainedAssetCount,
        });
        if (!confirmed) {
          return;
        }
      }
      await updateMemberTimeline({
        id: space.id,
        sharedSpaceMemberTimelineDto: { showInTimeline: !showInTimeline },
      });
      await invalidateAll();
    } catch (error) {
      handleError(error, $t('errors.unable_to_update_timeline_display_status'));
    }
  };

  const handleTogglePersonMetadataSharing = async () => {
    try {
      await updateMemberPreferences({
        id: space.id,
        sharedSpaceMemberPreferencesDto: { sharePersonMetadata: !sharePersonMetadata },
      });
      await invalidateAll();
    } catch (error) {
      handleError(error, $t('errors.unable_to_update_person_metadata_sharing'));
    }
  };

  const handleBulkAddAssets = async () => {
    const confirmed = await modalManager.showDialog({
      title: $t('add_all_photos'),
      prompt: $t('bulk_add_confirmation'),
    });
    if (!confirmed) {
      return;
    }
    try {
      await bulkAddAssets({ id: space.id });
      toastManager.success($t('bulk_add_started'));
    } catch (error) {
      handleError(error, $t('errors.error_adding_assets_to_space'));
    }
  };

  const handleTogglePets = async () => {
    try {
      await updateSpace({ id: space.id, sharedSpaceUpdateDto: { petsEnabled: !space.petsEnabled } });
      await invalidateAll();
    } catch (error) {
      handleError(error, $t('spaces_toggle_pets_failed'));
    }
  };

  const handleLeave = async () => {
    const confirmed = await modalManager.showDialog({
      prompt: $t(hasOwnLinkedAlbums ? 'spaces_leave_confirmation_with_albums' : 'spaces_leave_confirmation', {
        values: { name: space.name },
      }),
      title: $t('spaces_leave'),
    });
    if (!confirmed) {
      return;
    }
    try {
      await removeMember({ id: space.id, userId: authManager.user.id });
      toastManager.success($t('spaces_leave_success', { values: { name: space.name } }));
      await goto(Route.spaces());
    } catch (error) {
      handleError(error, $t('spaces_leave_failed'));
    }
  };

  const handleDelete = async () => {
    const confirmed = await modalManager.showDialog({
      prompt: $t('spaces_delete_confirmation', { values: { name: space.name } }),
      title: $t('spaces_delete'),
    });
    if (!confirmed) {
      return;
    }
    await removeSpace({ id: space.id });
    await goto(Route.spaces());
  };
</script>

{#if isDetailRoute}
  <!-- Person/album detail pages render their OWN UserPageLayout; the shell defers to them
       entirely so the app doesn't nest inside itself. -->
  {@render children?.()}
{:else}
  <!-- Only the Photos tab hides the page scrollbar: its timeline scrolls itself and brings a scrubber.
       Every other tab (albums, people, members, ...) scrolls the page and needs a visible scrollbar. -->
  <UserPageLayout hideNavbar={spaceUiManager.chromeHidden} title={space.name} scrollbar={!onPhotos}>
    {#snippet leading()}
      {#if !spaceUiManager.chromeHidden}
        <IconButton
          variant="ghost"
          shape="round"
          color="secondary"
          aria-label={$t('back')}
          onclick={() => goto(Route.spaces())}
          icon={mdiArrowLeft}
        />
      {/if}
    {/snippet}

    <!-- the Space's sections, beside its name in the bar (no cover above the page, no second row) -->
    {#snippet descriptionTrailing()}
      {#if showChrome}
        <SpaceTabs
          spaceId={space.id}
          faceRecognitionEnabled={space.faceRecognitionEnabled}
          albumCount={current.linkedAlbums.length}
          memberCount={members.length}
          isAdmin={authManager.user?.isAdmin ?? false}
          libraryCount={space.linkedLibraries?.length ?? 0}
          {personal}
          {albumsFirst}
        />
      {/if}
    {/snippet}

    {#snippet buttons()}
      {#if !spaceUiManager.chromeHidden}
        <div class="flex items-center gap-1">
          {#if isEditor}
            <!-- Mockup: a labeled primary "＋ Add photos" button; text hides on narrow widths → icon only. -->
            <Button
              size="small"
              leadingIcon={mdiImagePlusOutline}
              onclick={handleAddPhotos}
              aria-label={$t('add_photos')}
              data-testid="space-add-photos"
            >
              <span class="hidden sm:inline">{$t('add_photos')}</span>
            </Button>
          {/if}
          <ButtonContextMenu
            direction="left"
            align="top-right"
            color="secondary"
            title={$t('more')}
            icon={mdiDotsVertical}
            data-testid="space-overflow"
          >
            <MenuOption
              text={showInTimeline ? $t('spaces_hide_from_timeline') : $t('spaces_show_on_timeline')}
              icon={showInTimeline ? mdiEyeOutline : mdiEyeOffOutline}
              onClick={handleToggleTimeline}
            />
            <MenuOption
              text={sharePersonMetadata
                ? $t('spaces_stop_sharing_person_metadata')
                : $t('spaces_share_person_metadata')}
              icon={mdiFaceRecognition}
              onClick={handleTogglePersonMetadataSharing}
            />
            {#if isEditor}
              <hr class="my-1 border-gray-300" />
              <MenuOption text={$t('spaces_edit')} icon={mdiPencilOutline} onClick={handleEditSpace} />
              <!-- Local Omarchy layer: the cover's own menu went with the cover over the page -->
              <MenuOption text={$t('change_cover_photo')} icon={mdiImageEditOutline} onClick={handleChangeCover} />
              <MenuOption text={$t('add_all_photos')} icon={mdiImageMultipleOutline} onClick={handleBulkAddAssets} />
            {/if}
            {#if personal && isOwner}
              <!-- a Space of one shows no Members tab; inviting someone is still here -->
              <MenuOption
                text={$t('invite_people')}
                icon={mdiAccountPlusOutline}
                onClick={() => goto(`${base}/members`)}
              />
            {/if}
            {#if currentMember && !isOwner}
              <hr class="my-1 border-gray-300" />
              <MenuOption
                text={$t('spaces_leave')}
                icon={mdiExitToApp}
                textColor="text-red-500"
                onClick={handleLeave}
              />
            {/if}
            {#if isOwner}
              {#if space.faceRecognitionEnabled && space.hasPets}
                <hr class="my-1 border-gray-300" />
                <MenuOption
                  text={space.petsEnabled ? $t('spaces_hide_pets') : $t('spaces_show_pets')}
                  icon={mdiPaw}
                  onClick={handleTogglePets}
                />
              {/if}
              <hr class="my-1 border-gray-300" />
              <MenuOption
                text={$t('spaces_delete')}
                icon={mdiDeleteOutline}
                textColor="text-red-500"
                onClick={handleDelete}
              />
            {/if}
          </ButtonContextMenu>
        </div>
      {/if}
    {/snippet}

    <div class="flex h-full flex-col">
      <div class="min-h-0 flex-1">
        {@render children?.()}
      </div>
    </div>
  </UserPageLayout>
{/if}
