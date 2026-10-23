<script lang="ts">
  // Local Omarchy layer: a link in the Share sheet, ready to hand on ("QR invite"): its QR, at a size a phone reads off
  // a screen, beside the address it opens, Copy link, and the link's options and Delete (Turn off, on the memory Share
  // sheet, which asks in its own words and then says the link is off: modals/MemoryShareModal). The address is the
  // public one the rest of the app gives out (asUrl: the external domain), so the code works away from home; while no
  // external domain is set it can only be the address on this network, and the panel says so. The code is drawn black
  // on a white quiet zone whatever the theme, the one fixed colour pair outside a photo's caption: a camera needs the
  // contrast, and a dark theme would otherwise run into the code's edge.
  import SharedLinkEditModal from '$lib/modals/SharedLinkEditModal.svelte';
  import { serverConfigManager } from '$lib/managers/server-config-manager.svelte';
  import { asUrl, getSharedLinkActions, handleUpdateSharedLink } from '$lib/services/shared-link.service';
  import { locale } from '$lib/stores/preferences.store';
  import type { SharedLinkResponseDto } from '@immich/sdk';
  import { Icon, modalManager } from '@immich/ui';
  import { mdiContentCopy, mdiLinkOff, mdiPencilOutline, mdiTrashCanOutline } from '@mdi/js';
  import { DateTime } from 'luxon';
  import QRCode from 'qrcode';
  import { t } from 'svelte-i18n';

  type Props = {
    sharedLink: SharedLinkResponseDto;
    /** Turn off in place of Delete link: the sheet asks, deletes the link and says what is true then (the memory sheet) */
    onTurnOff?: () => void;
    /** while the sheet is turning it off */
    turningOff?: boolean;
  };

  const { sharedLink, onTurnOff, turningOff = false }: Props = $props();

  const url = $derived(asUrl(sharedLink));
  // drawn as SVG, so it stays sharp on every screen and at every zoom
  const qr = $derived(
    QRCode.toString(url, { type: 'svg', margin: 4, color: { dark: '#000000', light: '#ffffff' } }).then(
      (svg) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`,
    ),
  );
  const homeOnly = $derived(!serverConfigManager.value.externalDomain);

  // what the link allows, in the Shared links page's words: when it expires (a date: the locales' "Expires {date}"
  // reads "Expire le …", "Scade il …"), then download, upload, password, place
  const expired = $derived(!!sharedLink.expiresAt && DateTime.fromISO(sharedLink.expiresAt) < DateTime.now());
  const expiry = $derived.by(() => {
    if (!sharedLink.expiresAt) {
      return $t('share_link_expires_never');
    }
    const date = DateTime.fromISO(sharedLink.expiresAt).setLocale($locale).toLocaleString(DateTime.DATE_MED);
    return expired ? $t('expired') : $t('expires_date', { values: { date } });
  });
  const allows = $derived(
    [
      sharedLink.allowDownload && $t('download'),
      sharedLink.allowUpload && $t('upload'),
      sharedLink.password && $t('password'),
      sharedLink.showMetadata && $t('location'),
    ]
      .filter(Boolean)
      .join(' · '),
  );
  // a link made in one press is open for 30 days (shareLinkExpiry); one more press keeps it open, or opens an expired
  // one again
  const removeExpiry = () => handleUpdateSharedLink(sharedLink, { expiresAt: null });

  const { Copy, Delete } = $derived(getSharedLinkActions($t, sharedLink));
  const edit = () => modalManager.show(SharedLinkEditModal, { sharedLink });
</script>

<div class="ws-share-link" data-testid="share-link">
  <div class="ws-share-qr">
    {#await qr then src}
      <img {src} alt={$t('alt_text_qr_code')} width="160" height="160" draggable="false" />
    {/await}
  </div>
  <div class="ws-share-link-text">
    <p class="ws-share-url" title={url} data-testid="share-link-url">{url}</p>
    <p class="ws-sheet-note">
      <span class={{ 'ws-share-expired': expired }}>{expiry}</span>{#if allows}&nbsp;· {allows}{/if}
      {#if sharedLink.expiresAt}
        <button type="button" class="ws-share-remove-expiry" onclick={removeExpiry}
          >{$t('share_link_remove_expiry')}</button
        >
      {/if}
    </p>
    {#if homeOnly}
      <p class="ws-sheet-note">{$t('share_link_home_only')}</p>
    {/if}
    <div class="ws-share-link-actions">
      <button type="button" class="ws-sheet-primary" onclick={(event) => Copy.onAction({ action: Copy, event })}>
        <Icon icon={mdiContentCopy} size="18" aria-hidden="true" />
        {$t('copy_link')}
      </button>
      <button type="button" class="ws-sheet-quiet" onclick={edit}>
        <Icon icon={mdiPencilOutline} size="18" aria-hidden="true" />
        {$t('edit_link')}
      </button>
      {#if onTurnOff}
        <button type="button" class="ws-sheet-quiet" disabled={turningOff} onclick={onTurnOff}>
          <Icon icon={mdiLinkOff} size="18" aria-hidden="true" />
          {$t('share_link_turn_off')}
        </button>
      {:else}
        <button type="button" class="ws-sheet-quiet" onclick={(event) => Delete.onAction({ action: Delete, event })}>
          <Icon icon={mdiTrashCanOutline} size="18" aria-hidden="true" />
          {$t('delete_link')}
        </button>
      {/if}
    </div>
  </div>
</div>

<style>
  /* the code and its address side by side; on a narrow sheet the address goes under the code */
  .ws-share-link {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-start;
    gap: 1rem 1.25rem;
  }
  .ws-share-qr {
    flex: none;
    width: 160px;
    height: 160px;
    overflow: hidden;
    border-radius: var(--ws-radius);
    background: #ffffff;
    box-shadow: inset 0 0 0 1px var(--ws-hairline);
  }
  .ws-share-qr img {
    display: block;
    width: 100%;
    height: 100%;
  }
  .ws-share-link-text {
    display: grid;
    flex: 1 1 11rem;
    align-content: start;
    gap: 0.4rem;
    min-width: 0;
  }
  /* the address in data type, two lines at most: enough for the domain, which shows that it opens away from home */
  .ws-share-url {
    display: -webkit-box;
    overflow: hidden;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    color: var(--immich-ui-dark);
    font-family: var(--ws-font-data);
    font-size: var(--ws-text-data);
    font-weight: 600;
    line-height: 1.5;
    word-break: break-all;
    user-select: all;
  }
  .ws-share-expired {
    color: var(--ws-danger);
  }
  /* the expiry's one-press way out, a quiet underlined word at the line's end like Show selected's Put them back */
  .ws-share-remove-expiry {
    margin-inline-start: 0.5rem;
    color: var(--immich-ui-dark);
    font-weight: 500;
    text-decoration: underline;
    text-underline-offset: 0.25em;
    text-decoration-color: var(--ws-hairline);
  }
  .ws-share-remove-expiry:hover {
    text-decoration-color: var(--ws-accent);
  }
  .ws-share-remove-expiry:focus-visible {
    outline: var(--ws-border) solid var(--ws-accent);
    outline-offset: 2px;
  }
  /* Copy link in ink, then the link's options and Delete, one under the other beside the code */
  .ws-share-link-actions {
    display: grid;
    gap: 0.5rem;
    margin-top: 0.35rem;
  }
  .ws-share-link-actions button {
    justify-content: flex-start;
    width: 100%;
  }
</style>
