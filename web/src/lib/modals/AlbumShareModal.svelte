<script lang="ts">
  // Local Omarchy layer (plan A, "Let's go with A"; then "Family default target, QR invite"): one Share sheet on every
  // album, as on the Mac, in the order the family shares. First the Space it shows in, where it also stays in its own
  // folder: the Space that leads (utils/share-space; Family, as a rule) is a switch with who sees it, the others follow
  // quietly. Then a link anyone can open without an account, made in one go and shown with its QR, to scan off the
  // screen (components/omarchy/ShareLinkPanel). Then people with their own Gallery account (editors who can add photos,
  // or viewers). It takes over the album's Share button from the Options box, which keeps the album's settings. An
  // album's older links follow as rows with the line every link is told in (SharedLinkFacts: who can open it, when it
  // ends), where upstream's row (album-page/AlbumSharedLink, kept in the tree) gave the day it was made with no word
  // on what that day was.
  import SharedLinkFacts from '$lib/components/omarchy/SharedLinkFacts.svelte';
  import ShareLinkPanel from '$lib/components/omarchy/ShareLinkPanel.svelte';
  import OnEvents from '$lib/components/OnEvents.svelte';
  import UserAvatar from '$lib/components/shared-components/UserAvatar.svelte';
  import { authManager } from '$lib/managers/auth-manager.svelte';
  import { eventManager } from '$lib/managers/event-manager.svelte';
  import { getAlbumActions, handleRemoveUserFromAlbum, handleUpdateUserAlbumRole } from '$lib/services/album.service';
  import { getSharedLinkActions, makeSharedLink, shareLinkExpiry } from '$lib/services/shared-link.service';
  import { lang } from '$lib/stores/preferences.store';
  import { handleError } from '$lib/utils/handle-error';
  import { leadSpace, rememberShareSpace, shareableSpaces, spaceAudience } from '$lib/utils/share-space';
  import {
    AlbumUserRole,
    getAlbumInfo,
    getAllSharedLinks,
    getAllSpaces,
    linkAlbum,
    SharedLinkType,
    unlinkAlbum,
    type AlbumResponseDto,
    type SharedLinkResponseDto,
    type SharedSpaceResponseDto,
    type UserResponseDto,
  } from '@immich/sdk';
  import { ActionButton, Field, Icon, Modal, ModalBody, Select, Switch, type SelectOption } from '@immich/ui';
  import { mdiLinkVariantPlus, mdiPlus } from '@mdi/js';
  import { onMount } from 'svelte';
  import { t } from 'svelte-i18n';

  type Props = {
    album: AlbumResponseDto;
    onClose: () => void;
  };

  let { album, onClose }: Props = $props();

  let sharedLinks = $state<SharedLinkResponseDto[]>([]);
  let spaces = $state<SharedSpaceResponseDto[]>([]);
  // chosen once the Spaces are in, and kept while the sheet is open: a switch turned off must not hand the lead on
  let lead = $state<SharedSpaceResponseDto>();
  let loaded = $state(false);
  let busySpaceId = $state<string>();
  let making = $state(false);

  const me = $derived(authManager.user.id);
  const people = $derived(album.albumUsers.filter(({ role }) => role !== AlbumUserRole.Owner));
  const shownIn = $derived(new Set((album.sharedSpaceLinks ?? []).map(({ spaceId }) => spaceId)));
  const others = $derived(spaces.filter(({ id }) => id !== lead?.id));
  // newest first: the link made last is the one shown with its QR, any older ones follow as rows
  const links = $derived([...sharedLinks].sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
  const audience = $derived(
    lead
      ? spaceAudience($t, $lang, lead, me, { alone: 'album_share_space_alone', audience: 'album_share_space_audience' })
      : '',
  );
  const { AddUsers } = $derived(getAlbumActions($t, album));

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
      spaces = shareableSpaces(all, me);
      lead = leadSpace(spaces, shownIn);
    } catch (error) {
      handleError(error, $t('failed_to_load_albums'));
    } finally {
      loaded = true;
    }
  });

  const handleRoleSelect = async (user: UserResponseDto, role: AlbumUserRole | 'none') => {
    if (role === 'none') {
      await handleRemoveUserFromAlbum(album, user);
      return;
    }
    await handleUpdateUserAlbumRole({ albumId: album.id, userId: user.id, role });
  };

  // shown in a Space or not; the album keeps its own folder either way, and a Space it goes to leads the next sheet
  const showInSpace = async (space: SharedSpaceResponseDto, show: boolean) => {
    busySpaceId = space.id;
    try {
      await (show ? linkAlbum({ id: space.id, albumId: album.id }) : unlinkAlbum({ id: space.id, albumId: album.id }));
      if (show) {
        rememberShareSpace(space.id);
      }
      eventManager.emit(show ? 'SpaceLinkAlbum' : 'SpaceUnlinkAlbum', { spaceId: space.id });
      await refreshAlbum();
    } catch (error) {
      handleError(error, $t(show ? 'spaces_linked_albums_error_link' : 'spaces_linked_albums_error_unlink'));
    } finally {
      busySpaceId = undefined;
    }
  };

  // one press makes the link, with a new link's own defaults (downloads on, the place left out: SharedLinkFormFields) and
  // open for 30 days (shareLinkExpiry);
  // it arrives through SharedLinkCreate like a link made anywhere else, and its options are a press away on it
  const makeLink = async () => {
    making = true;
    await makeSharedLink({
      type: SharedLinkType.Album,
      albumId: album.id,
      allowDownload: true,
      allowUpload: false,
      showMetadata: false,
      expiresAt: shareLinkExpiry(),
    });
    making = false;
  };

  const ofThisAlbum = (link: SharedLinkResponseDto) => !link.album || link.album.id === album.id;
</script>

<OnEvents
  onAlbumUserDelete={refreshAlbum}
  onAlbumShare={refreshAlbum}
  onSharedLinkCreate={(link) => {
    if (ofThisAlbum(link) && sharedLinks.every(({ id }) => id !== link.id)) {
      sharedLinks = [...sharedLinks, link];
    }
  }}
  onSharedLinkUpdate={(link) => (sharedLinks = sharedLinks.map((item) => (item.id === link.id ? link : item)))}
  onSharedLinkDelete={(link) => (sharedLinks = sharedLinks.filter(({ id }) => id !== link.id))}
  onAlbumUpdate={(updated) => (album = updated)}
/>

{#snippet spaceSwitch(space: SharedSpaceResponseDto)}
  <Switch
    id="share-space-{space.id}"
    checked={shownIn.has(space.id)}
    disabled={busySpaceId === space.id}
    onCheckedChange={(checked) => showInSpace(space, checked)}
    aria-describedby={space.id === lead?.id ? 'share-space-audience' : undefined}
    data-testid="album-share-space-{space.id}"
  />
{/snippet}

<Modal title={$t('album_share_title', { values: { name: album.albumName } })} {onClose} size="small">
  <ModalBody class="p-0">
    <div class="ws-sheet">
      {#if loaded}
        <section class="ws-sheet-section" data-testid="album-share-spaces">
          {#if lead}
            <div class="ws-sheet-head">
              <label class="ws-sheet-title" for="input-share-space-{lead.id}">
                {$t('album_share_show_in', { values: { name: lead.name } })}
              </label>
              {@render spaceSwitch(lead)}
            </div>
            <p class="ws-sheet-note" id="share-space-audience">{audience}</p>
            {#each others as space (space.id)}
              <div class="ws-sheet-row">
                <label for="input-share-space-{space.id}">
                  {$t('album_share_show_in', { values: { name: space.name } })}
                </label>
                {@render spaceSwitch(space)}
              </div>
            {/each}
          {:else}
            <div class="ws-sheet-head"><h3 class="ws-sheet-title">{$t('spaces')}</h3></div>
            <p class="ws-sheet-note">{$t('album_share_no_spaces')}</p>
          {/if}
        </section>

        <section class="ws-sheet-section" data-testid="album-share-links">
          <div class="ws-sheet-head">
            <h3 class="ws-sheet-title">{$t('link')}</h3>
            {#if links.length === 0}
              <button
                type="button"
                class="ws-sheet-quiet"
                disabled={making}
                onclick={makeLink}
                data-testid="share-make-link"
              >
                <Icon icon={mdiLinkVariantPlus} size="18" aria-hidden="true" />
                {$t('share_make_link')}
              </button>
            {/if}
          </div>
          {#if links.length === 0}
            <p class="ws-sheet-note">{$t('album_share_link_hint')}</p>
          {:else}
            <ShareLinkPanel sharedLink={links[0]} />
            {#each links.slice(1) as sharedLink (sharedLink.id)}
              {@const { ViewQrCode, Copy, Delete } = getSharedLinkActions($t, sharedLink)}
              <div class="ws-share-older" data-testid="album-share-older-link">
                <div class="ws-share-older-text">
                  <p class="ws-share-older-name">{sharedLink.description || album.albumName}</p>
                  <SharedLinkFacts {sharedLink} download />
                </div>
                <div class="ws-share-older-actions">
                  <ActionButton action={ViewQrCode} />
                  <ActionButton action={Copy} />
                  <ActionButton action={Delete} />
                </div>
              </div>
            {/each}
          {/if}
        </section>

        <section class="ws-sheet-section" data-testid="album-share-people">
          <div class="ws-sheet-head">
            <h3 class="ws-sheet-title">{$t('people')}</h3>
            <button
              type="button"
              class="ws-sheet-quiet"
              onclick={(event) => AddUsers.onAction({ action: AddUsers, event })}
            >
              <Icon icon={mdiPlus} size="18" aria-hidden="true" />
              {AddUsers.title}
            </button>
          </div>
          {#if people.length === 0}
            <p class="ws-sheet-note">{$t('album_share_people_hint')}</p>
          {:else}
            <div>
              {#each people as { user, role } (user.id)}
                <div class="ws-sheet-person">
                  <span class="ws-sheet-person-name">
                    <UserAvatar {user} size="md" />
                    <span class="truncate">{user.name}</span>
                  </span>
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
      {/if}
    </div>
  </ModalBody>
</Modal>

<style>
  /* an older link: its name over its line, its actions at the row's end */
  .ws-share-older {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    min-height: 2.75rem;
  }
  .ws-share-older-text {
    display: grid;
    gap: 0.1rem;
    min-width: 0;
  }
  .ws-share-older-name {
    overflow: hidden;
    color: var(--immich-ui-dark);
    font-size: var(--ws-text-ui);
    font-weight: 500;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .ws-share-older-actions {
    display: flex;
    flex: none;
  }
</style>
