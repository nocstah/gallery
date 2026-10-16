<script lang="ts">
  // Local Omarchy layer: Share on a selection of photos, in the album Share sheet's grammar ("Family default target,
  // QR invite"). First Add to the Space that leads (utils/share-space; Family, as a rule), through the same dispatch as
  // the Add to album or space picker (addAssetsToCollections), with who sees them; other Spaces follow quietly. Then a
  // link made in one go and shown with its QR (components/omarchy/ShareLinkPanel). A Space takes only my own photos
  // (Permission.AssetShare, as a drop on the sidebar does) and so does a link (#853), except on a Space whose page
  // scopes the link to itself (#1018, the selection bar's shareSpaceId): the link then takes the whole selection, and
  // the sheet says before it is made that other members' photos become public.
  import ShareLinkPanel from '$lib/components/omarchy/ShareLinkPanel.svelte';
  import OnEvents from '$lib/components/OnEvents.svelte';
  import { spaceToCollection } from '$lib/components/shared-components/collection-selection/collection-selection-utils';
  import { MAX_SPACE_ASSETS_PER_REQUEST } from '$lib/constants';
  import { authManager } from '$lib/managers/auth-manager.svelte';
  import { addAssetsToCollections } from '$lib/services/collection.service';
  import { makeSharedLink, shareLinkExpiry } from '$lib/services/shared-link.service';
  import { lang } from '$lib/stores/preferences.store';
  import { handleError } from '$lib/utils/handle-error';
  import { leadSpace, rememberShareSpace, shareableSpaces, spaceAudience } from '$lib/utils/share-space';
  import { getAllSpaces, SharedLinkType, type SharedLinkResponseDto, type SharedSpaceResponseDto } from '@immich/sdk';
  import { Icon, Modal, ModalBody } from '@immich/ui';
  import { mdiAlertOutline, mdiCheck, mdiLinkVariantPlus, mdiPlus } from '@mdi/js';
  import { onMount } from 'svelte';
  import { SvelteSet } from 'svelte/reactivity';
  import { t } from 'svelte-i18n';

  type Props = {
    onClose: () => void;
    /** the photos a link covers: my own (#853), or the whole selection where the link is made against a Space */
    assetIds: string[];
    /** my own photos among those selected: the only ones a Space takes */
    ownedAssetIds: string[];
    /** how many selected photos the link leaves out, being someone else's */
    excludedCount?: number;
    /** #1018: the Space the link is made against (the selection bar's shareSpaceId) */
    spaceId?: string;
    /** #1018: how many of `assetIds` other members contributed, said before the link makes them public */
    contributedCount?: number;
    /** the Space whose page the photos are selected on: they are in it already, so it is not offered */
    fromSpaceId?: string;
  };

  let {
    onClose,
    assetIds,
    ownedAssetIds,
    excludedCount = 0,
    spaceId,
    contributedCount = 0,
    fromSpaceId,
  }: Props = $props();

  let spaces = $state<SharedSpaceResponseDto[]>([]);
  let fromSpace = $state<SharedSpaceResponseDto>();
  let lead = $state<SharedSpaceResponseDto>();
  let loaded = $state(false);
  let busySpaceId = $state<string>();
  const added = new SvelteSet<string>();
  let link = $state<SharedLinkResponseDto>();
  let making = $state(false);

  const me = $derived(authManager.user.id);
  const count = $derived(assetIds.length + excludedCount);
  const others = $derived(spaces.filter(({ id }) => id !== lead?.id));
  const leftOut = $derived(count - ownedAssetIds.length);
  const audience = $derived(
    lead
      ? spaceAudience(
          $t,
          $lang,
          lead,
          me,
          { alone: 'share_photos_space_alone', audience: 'share_photos_space_audience' },
          { count: ownedAssetIds.length },
        )
      : '',
  );

  onMount(async () => {
    try {
      const all = await getAllSpaces();
      fromSpace = all.find(({ id }) => id === fromSpaceId);
      spaces = shareableSpaces(all, me).filter(({ id }) => id !== fromSpaceId);
      lead = leadSpace(spaces);
    } catch (error) {
      handleError(error, $t('failed_to_load_spaces'));
    } finally {
      loaded = true;
    }
  });

  // my photos go in as the picker sends them (its toast, View Space), and the Space leads the next sheet
  const addTo = async (space: SharedSpaceResponseDto) => {
    busySpaceId = space.id;
    const ok = await addAssetsToCollections([spaceToCollection(space)], ownedAssetIds);
    busySpaceId = undefined;
    if (ok) {
      added.add(space.id);
      rememberShareSpace(space.id);
    }
  };

  // one press makes the link, with a new link's own defaults (downloads on, the place left out: SharedLinkFormFields) and
  // open for 30 days (shareLinkExpiry)
  const makeLink = async () => {
    making = true;
    link = await makeSharedLink({
      type: SharedLinkType.Individual,
      assetIds,
      spaceId,
      allowDownload: true,
      allowUpload: false,
      showMetadata: false,
      expiresAt: shareLinkExpiry(),
    });
    making = false;
  };
</script>

<OnEvents
  onSharedLinkUpdate={(updated) => {
    if (updated.id === link?.id) {
      link = updated;
    }
  }}
  onSharedLinkDelete={(deleted) => {
    if (deleted.id === link?.id) {
      link = undefined;
    }
  }}
/>

{#snippet addButton(space: SharedSpaceResponseDto, primary: boolean)}
  {#if added.has(space.id)}
    <p class="ws-sheet-done" role="status">
      <Icon icon={mdiCheck} size="18" aria-hidden="true" />
      {$t('share_photos_added_to', { values: { name: space.name, count: ownedAssetIds.length } })}
    </p>
  {:else}
    <button
      type="button"
      class={primary ? 'ws-sheet-primary' : 'ws-sheet-quiet'}
      disabled={busySpaceId !== undefined}
      aria-describedby={primary ? 'share-space-audience' : undefined}
      onclick={() => addTo(space)}
      data-testid="selection-share-space-{space.id}"
    >
      <Icon icon={mdiPlus} size="18" aria-hidden="true" />
      {$t('drop_add_to', { values: { name: space.name } })}
    </button>
  {/if}
{/snippet}

<Modal title={$t('share_photos_title', { values: { count } })} {onClose} size="small">
  <ModalBody class="p-0">
    <div class="ws-sheet">
      {#if loaded}
        <section class="ws-sheet-section" data-testid="selection-share-spaces">
          {#if lead && ownedAssetIds.length > 0 && ownedAssetIds.length <= MAX_SPACE_ASSETS_PER_REQUEST}
            {@render addButton(lead, true)}
            <p class="ws-sheet-note" id="share-space-audience">{audience}</p>
            {#if leftOut > 0}
              <p class="ws-sheet-note">{$t('share_photos_space_left_out', { values: { count: leftOut } })}</p>
            {/if}
            {#if others.length > 0}
              <div class="ws-sheet-others">
                {#each others as space (space.id)}
                  {@render addButton(space, false)}
                {/each}
              </div>
            {/if}
          {:else}
            <div class="ws-sheet-head"><h3 class="ws-sheet-title">{$t('spaces')}</h3></div>
            <p class="ws-sheet-note">
              {#if !lead && fromSpace}
                {$t('share_photos_in_space', { values: { name: fromSpace.name, count } })}
              {:else if !lead}
                {$t('album_share_no_spaces')}
              {:else if ownedAssetIds.length === 0}
                {$t('share_photos_space_only_yours')}
              {:else}
                {$t('share_photos_space_too_many', { values: { count: MAX_SPACE_ASSETS_PER_REQUEST } })}
              {/if}
            </p>
          {/if}
        </section>

        <section class="ws-sheet-section" data-testid="selection-share-link">
          <div class="ws-sheet-head">
            <h3 class="ws-sheet-title">{$t('link')}</h3>
            {#if !link && assetIds.length > 0}
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
          {#if link}
            <ShareLinkPanel sharedLink={link} />
          {:else}
            <p class="ws-sheet-note">{$t('share_photos_link_hint', { values: { count: assetIds.length } })}</p>
            {#if spaceId && contributedCount > 0}
              <p class="ws-sheet-warning" role="status" data-testid="shared-link-contributed-warning">
                <Icon icon={mdiAlertOutline} size="18" aria-hidden="true" />
                {$t('shared_link_includes_contributed_assets', { values: { count: contributedCount } })}
              </p>
            {/if}
          {/if}
          {#if excludedCount > 0}
            <p class="ws-sheet-note" data-testid="shared-link-excluded-notice">
              {$t('shared_link_excludes_other_owners', { values: { count: excludedCount } })}
            </p>
          {/if}
        </section>
      {/if}
    </div>
  </ModalBody>
</Modal>
