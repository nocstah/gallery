<script lang="ts">
  // Local Omarchy layer (plan A, "Let's go with A"): one Share sheet on every album, as on the Mac. People with their
  // own Gallery account (as editors who can add photos, or viewers), links anyone can open without an account, and the
  // Spaces (libraries shared with family) the album shows in, where it also stays in its own folder. It takes over the
  // album's Share button from the Options box, which keeps the album's settings.
  import AlbumSharedLink from '$lib/components/album-page/AlbumSharedLink.svelte';
  import HeaderActionButton from '$lib/components/HeaderActionButton.svelte';
  import OnEvents from '$lib/components/OnEvents.svelte';
  import { isWritableSpace } from '$lib/components/shared-components/collection-selection/collection-selection-utils';
  import UserAvatar from '$lib/components/shared-components/UserAvatar.svelte';
  import { isLibrarySpace } from '$lib/managers/album-folders.svelte';
  import { authManager } from '$lib/managers/auth-manager.svelte';
  import { eventManager } from '$lib/managers/event-manager.svelte';
  import { getAlbumActions, handleRemoveUserFromAlbum, handleUpdateUserAlbumRole } from '$lib/services/album.service';
  import { handleError } from '$lib/utils/handle-error';
  import {
    AlbumUserRole,
    getAlbumInfo,
    getAllSharedLinks,
    getAllSpaces,
    linkAlbum,
    unlinkAlbum,
    type AlbumResponseDto,
    type SharedLinkResponseDto,
    type SharedSpaceResponseDto,
    type UserResponseDto,
  } from '@immich/sdk';
  import { Field, HStack, Modal, ModalBody, Select, Stack, Switch, Text, type SelectOption } from '@immich/ui';
  import { onMount } from 'svelte';
  import { t } from 'svelte-i18n';

  type Props = {
    album: AlbumResponseDto;
    onClose: () => void;
  };

  let { album, onClose }: Props = $props();

  let sharedLinks = $state<SharedLinkResponseDto[]>([]);
  let spaces = $state<SharedSpaceResponseDto[]>([]);
  let busySpaceId = $state<string>();

  const people = $derived(album.albumUsers.filter(({ role }) => role !== AlbumUserRole.Owner));
  const shownIn = $derived(new Set((album.sharedSpaceLinks ?? []).map(({ spaceId }) => spaceId)));
  const { AddUsers, CreateSharedLink } = $derived(getAlbumActions($t, album));

  const refreshAlbum = async () => {
    album = await getAlbumInfo({ id: album.id });
  };

  onMount(async () => {
    try {
      const [links, all] = await Promise.all([
        getAllSharedLinks({ albumId: album.id }),
        getAllSpaces(),
        refreshAlbum(),
      ]);
      sharedLinks = links;
      spaces = all.filter((space) => !isLibrarySpace(space) && isWritableSpace(space, authManager.user.id));
    } catch (error) {
      handleError(error, $t('failed_to_load_albums'));
    }
  });

  const handleRoleSelect = async (user: UserResponseDto, role: AlbumUserRole | 'none') => {
    if (role === 'none') {
      await handleRemoveUserFromAlbum(album, user);
      return;
    }
    await handleUpdateUserAlbumRole({ albumId: album.id, userId: user.id, role });
  };

  // shown in a Space or not; the album keeps its own folder either way
  const showInSpace = async (space: SharedSpaceResponseDto, show: boolean) => {
    busySpaceId = space.id;
    try {
      await (show ? linkAlbum({ id: space.id, albumId: album.id }) : unlinkAlbum({ id: space.id, albumId: album.id }));
      eventManager.emit(show ? 'SpaceLinkAlbum' : 'SpaceUnlinkAlbum', { spaceId: space.id });
      await refreshAlbum();
    } catch (error) {
      handleError(error, $t(show ? 'spaces_linked_albums_error_link' : 'spaces_linked_albums_error_unlink'));
    } finally {
      busySpaceId = undefined;
    }
  };
</script>

<OnEvents
  onAlbumUserDelete={refreshAlbum}
  onAlbumShare={refreshAlbum}
  onSharedLinkCreate={(link) => (sharedLinks = [...sharedLinks, link])}
  onSharedLinkDelete={(link) => (sharedLinks = sharedLinks.filter(({ id }) => id !== link.id))}
  onAlbumUpdate={(updated) => (album = updated)}
/>

<Modal title={$t('album_share_title', { values: { name: album.albumName } })} {onClose} size="small">
  <ModalBody>
    <Stack gap={6}>
      <section data-testid="album-share-people">
        <HStack fullWidth class="mb-2 justify-between">
          <Text size="medium" fontWeight="semi-bold">{$t('people')}</Text>
          <HeaderActionButton action={AddUsers} />
        </HStack>
        {#if people.length === 0}
          <Text size="small" color="muted">{$t('album_share_people_hint')}</Text>
        {:else}
          <div class="ps-2">
            {#each people as { user, role } (user.id)}
              <div class="flex items-center justify-between gap-4 py-2">
                <div class="flex min-w-0 items-center gap-2">
                  <UserAvatar {user} size="md" />
                  <Text size="small" class="truncate">{user.name}</Text>
                </div>
                <Field class="w-32">
                  <Select
                    value={role}
                    options={[
                      { label: $t('role_editor'), value: AlbumUserRole.Editor },
                      { label: $t('role_viewer'), value: AlbumUserRole.Viewer },
                      { label: $t('remove_user'), value: 'none' },
                    ] as SelectOption<AlbumUserRole | 'none'>[]}
                    onChange={(value) => handleRoleSelect(user, value)}
                  />
                </Field>
              </div>
            {/each}
          </div>
        {/if}
      </section>

      <section data-testid="album-share-links">
        <HStack fullWidth class="mb-2 justify-between">
          <Text size="medium" fontWeight="semi-bold">{$t('shared_links')}</Text>
          <HeaderActionButton action={CreateSharedLink} />
        </HStack>
        {#if sharedLinks.length === 0}
          <Text size="small" color="muted">{$t('album_share_link_hint')}</Text>
        {:else}
          <div class="ps-2">
            <Stack gap={4}>
              {#each sharedLinks as sharedLink (sharedLink.id)}
                <AlbumSharedLink {album} {sharedLink} />
              {/each}
            </Stack>
          </div>
        {/if}
      </section>

      <section data-testid="album-share-spaces">
        <Text size="medium" fontWeight="semi-bold" class="mb-2">{$t('spaces')}</Text>
        {#if spaces.length === 0}
          <Text size="small" color="muted">{$t('album_share_no_spaces')}</Text>
        {:else}
          <Text size="small" color="muted" class="mb-2">{$t('album_share_spaces_hint')}</Text>
          <div class="grid gap-y-3 ps-2">
            {#each spaces as space (space.id)}
              <Field label={space.name} disabled={busySpaceId === space.id}>
                <Switch
                  checked={shownIn.has(space.id)}
                  onCheckedChange={(checked) => showInSpace(space, checked)}
                  data-testid="album-share-space-{space.id}"
                />
              </Field>
            {/each}
          </div>
        {/if}
      </section>
    </Stack>
  </ModalBody>
</Modal>
