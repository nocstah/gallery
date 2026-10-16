<script lang="ts">
  import AppDownloadModal from '$lib/modals/AppDownloadModal.svelte';
  import ObtainiumConfigModal from '$lib/modals/ObtainiumConfigModal.svelte';
  import { Route } from '$lib/route';
  import { Icon, modalManager } from '@immich/ui';
  import {
    mdiCellphoneArrowDownVariant,
    mdiContentDuplicate,
    mdiCrosshairsGps,
    mdiImageSizeSelectLarge,
    mdiLinkEdit,
    mdiQrcode,
    mdiStateMachine,
  } from '@mdi/js';
  import { t } from 'svelte-i18n';

  const links = [
    { href: Route.duplicatesUtility(), icon: mdiContentDuplicate, label: $t('review_duplicates') },
    { href: Route.largeFileUtility(), icon: mdiImageSizeSelectLarge, label: $t('review_large_files') },
    { href: Route.geolocationUtility(), icon: mdiCrosshairsGps, label: $t('manage_geolocation') },
    // Local Omarchy layer: the bank slips and QR codes, filed into QR and the small ones sent to the Trash
    { href: Route.slipsUtility(), icon: mdiQrcode, label: $t('slips') },
    { href: Route.workflows(), icon: mdiStateMachine, label: $t('workflows') },
  ];
</script>

<!-- Local Omarchy layer: two headed lists on the page column, each row drawn as Settings and the explorer lists draw one,
     between hairlines with the pointer's tint inside, instead of two rounded cards with accent icons -->
<section class="ws-utilities">
  <h2 class="ws-utilities-heading">{$t('organize_your_library')}</h2>
  <ul>
    {#each links as link (link.href)}
      <li>
        <a href={link.href} class="ws-utility">
          <Icon icon={link.icon} size="20" class="ws-utility-icon" />
          {link.label}
        </a>
      </li>
    {/each}
  </ul>
</section>

<section class="ws-utilities">
  <h2 class="ws-utilities-heading">{$t('download')}</h2>
  <ul>
    <li>
      <button type="button" class="ws-utility" onclick={() => modalManager.show(ObtainiumConfigModal, {})}>
        <Icon icon={mdiLinkEdit} size="20" class="ws-utility-icon" />
        {$t('obtainium_configurator')}
      </button>
    </li>
    <li>
      <button type="button" class="ws-utility" onclick={() => modalManager.show(AppDownloadModal, {})}>
        <Icon icon={mdiCellphoneArrowDownVariant} size="20" class="ws-utility-icon" />
        {$t('app_download_links')}
      </button>
    </li>
  </ul>
</section>

<style>
  .ws-utilities {
    padding-top: calc(var(--ws-gap) * 0.6);
    color: var(--immich-ui-dark);
  }
  .ws-utilities + .ws-utilities {
    margin-top: 2.5rem;
  }
  /* a section's name in the heading role over a hairline, as Sharing heads its sections */
  .ws-utilities-heading {
    padding-bottom: calc(var(--ws-gap) * 0.8);
    margin-bottom: calc(var(--ws-gap) * 0.4);
    border-bottom: 1px solid var(--ws-hairline);
    font-size: var(--ws-text-heading);
    font-weight: 600;
  }
  .ws-utilities li {
    border-bottom: 1px solid var(--ws-hairline);
  }
  .ws-utility {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    width: 100%;
    min-height: 2.75rem;
    padding: 0.4rem 0.5rem;
    border-radius: var(--ws-radius);
    font-size: var(--ws-text-ui);
    font-weight: 500;
    text-align: start;
    transition: background-color 140ms cubic-bezier(0.22, 1, 0.36, 1);
  }
  .ws-utility:hover {
    background: color-mix(in oklab, var(--immich-ui-dark) 4%, transparent);
  }
  .ws-utility:focus-visible {
    outline: var(--ws-border) solid var(--ws-accent);
    outline-offset: calc(var(--ws-border) * -1);
  }
  .ws-utility :global(.ws-utility-icon) {
    flex: none;
    color: var(--immich-ui-muted);
  }
  .ws-utility:hover :global(.ws-utility-icon) {
    color: var(--immich-ui-dark);
  }
  @media (prefers-reduced-motion: reduce) {
    .ws-utility {
      transition: none;
    }
  }
</style>
