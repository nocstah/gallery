<script lang="ts">
  // Local Omarchy layer: Help says who runs this Gallery and how to reach them, which is what the family needs from it;
  // upstream sent everyone to the Immich project's docs, GitHub and Discord. The owner's way to be reached is the
  // server's support link (utils/help-contact: nothing else names the admin to another account); its email address
  // gives a name and face when an account here has it. The projects' own links, the Noodle Gallery and upstream
  // Immich ones, are for the owner, the server's admin, under About with the server's details; the version stays for
  // everyone. apply-branding (patch_help_modal) rewrites the project URLs below by their exact text, so they stay as
  // upstream wrote them, and the upstream ones between the BRANDING:UPSTREAM markers.
  import UserAvatar from '$lib/components/shared-components/UserAvatar.svelte';
  import { authManager } from '$lib/managers/auth-manager.svelte';
  import ServerAboutModal from '$lib/modals/ServerAboutModal.svelte';
  import { userInteraction } from '$lib/stores/user.svelte';
  import { contactPerson, helpContact, SUPPORT_URL_VARIABLE } from '$lib/utils/help-contact';
  import {
    getAboutInfo,
    getVersionHistory,
    searchUsers,
    type ServerAboutResponseDto,
    type UserResponseDto,
  } from '@immich/sdk';
  import { Icon, Modal, ModalBody, modalManager } from '@immich/ui';
  import {
    mdiBugOutline,
    mdiEmailOutline,
    mdiGit,
    mdiGithub,
    mdiInformationOutline,
    mdiOpenInNew,
    mdiPhoneOutline,
    mdiServerOutline,
  } from '@mdi/js';
  import { type SimpleIcon, siDiscord } from 'simple-icons';
  import { onMount } from 'svelte';
  import { t } from 'svelte-i18n';

  interface Props {
    onClose: () => void;
    info?: ServerAboutResponseDto;
  }

  let { onClose, info: given }: Props = $props();

  let info = $state<ServerAboutResponseDto | undefined>(given);
  let people = $state<UserResponseDto[]>([]);

  const isOwner = $derived(authManager.user.isAdmin);
  const contact = $derived(helpContact(info?.thirdPartySupportUrl));
  // the support address's account, unless it is the reader's own
  const person = $derived.by(() => {
    const found = contactPerson(contact, people);
    return found?.id === authManager.user.id ? undefined : found;
  });
  const contactIcon = $derived(
    contact?.kind === 'email' ? mdiEmailOutline : contact?.kind === 'phone' ? mdiPhoneOutline : mdiOpenInNew,
  );

  onMount(async () => {
    try {
      info ??= userInteraction.aboutInfo ?? (await getAboutInfo());
    } catch {
      return;
    }
    // a name and a face for the support address, from the accounts this server shows everyone (or none)
    if (contact?.kind === 'email' && !isOwner) {
      people = await searchUsers().catch(() => []);
    }
  });

  const showServerDetails = async () => {
    if (!info) {
      return;
    }
    const about = info;
    const versions = userInteraction.versions ?? (await getVersionHistory().catch(() => []));
    onClose();
    await modalManager.show(ServerAboutModal, { info: about, versions });
  };
</script>

{#snippet link(url: string, icon: string | SimpleIcon, text: string)}
  <a class="ws-help-link" href={url} target="_blank" rel="noreferrer">
    <Icon {icon} size="18" aria-hidden />
    <span>{text}</span>
  </a>
{/snippet}

<Modal title={$t('help_title')} {onClose} size="small">
  <ModalBody class="p-0">
    <div class="ws-sheet ws-help" data-testid="help-sheet">
      <!-- who runs this Gallery, and how to reach them -->
      <section class="ws-sheet-section">
        <div class="ws-help-who">
          {#if isOwner}
            <span class="ws-help-face" aria-hidden="true"><UserAvatar user={authManager.user} size="md" noTitle /></span
            >
          {:else if person}
            <span class="ws-help-face" aria-hidden="true"><UserAvatar user={person} size="md" noTitle /></span>
          {/if}
          <h3 class="ws-sheet-title" data-testid="help-owner">
            {#if isOwner}
              {$t('help_owner_you')}
            {:else if person}
              {$t('help_owner_named', { values: { name: person.name } })}
            {:else}
              {$t('help_owner_unnamed')}
            {/if}
          </h3>
        </div>
        {#if isOwner}
          {#if contact}
            <p class="ws-sheet-note">{$t('help_owner_contact_set', { values: { address: contact.address } })}</p>
          {:else if info}
            <p class="ws-sheet-note" data-testid="help-owner-setup">
              {$t('help_owner_contact_unset', {
                values: { variable: SUPPORT_URL_VARIABLE, example: `mailto:${authManager.user.email}` },
              })}
            </p>
          {/if}
        {:else}
          <p class="ws-sheet-note">{$t('help_ask_owner')}</p>
          {#if contact}
            <div class="ws-help-contact">
              <a
                class="ws-sheet-primary"
                href={contact.href}
                target="_blank"
                rel="noreferrer"
                data-testid="help-contact"
              >
                <Icon icon={contactIcon} size="18" aria-hidden />
                {person
                  ? $t('help_contact_named', { values: { kind: contact.kind, name: person.name } })
                  : $t('help_contact_unnamed')}
              </a>
              <span class="ws-help-address">{contact.address}</span>
            </div>
          {/if}
        {/if}
        {#if info?.thirdPartyDocumentationUrl || info?.thirdPartyBugFeatureUrl || (isOwner && info?.thirdPartySourceUrl)}
          <div class="ws-help-links">
            {#if info.thirdPartyDocumentationUrl}
              {@render link(info.thirdPartyDocumentationUrl, mdiInformationOutline, $t('documentation'))}
            {/if}
            {#if info.thirdPartyBugFeatureUrl}
              {@render link(info.thirdPartyBugFeatureUrl, mdiBugOutline, $t('help_report_problem'))}
            {/if}
            {#if isOwner && info.thirdPartySourceUrl}
              {@render link(info.thirdPartySourceUrl, mdiGit, $t('source'))}
            {/if}
          </div>
        {/if}
      </section>

      <!-- the projects behind it and the server's details: the owner's -->
      {#if isOwner && info}
        <section class="ws-sheet-section" data-testid="help-about">
          <div class="ws-sheet-head"><h3 class="ws-sheet-title">{$t('about')}</h3></div>
          <div class="ws-help-links">
            {@render link(
              `https://docs.${info.version}.archive.immich.app/overview/introduction`,
              mdiInformationOutline,
              $t('documentation'),
            )}
            {@render link('https://github.com/immich-app/immich/', mdiGithub, $t('source'))}
            {@render link(
              'https://github.com/immich-app/immich/issues/new/choose',
              mdiBugOutline,
              $t('bugs_and_feature_requests'),
            )}
          </div>
          <!-- BRANDING:UPSTREAM_START -->
          <p class="ws-help-group">{$t('upstream_project')}</p>
          <div class="ws-help-links">
            {@render link('https://github.com/immich-app/immich', mdiGithub, 'Immich')}
            {@render link('https://docs.immich.app', mdiInformationOutline, $t('documentation'))}
            {@render link('https://discord.immich.app', siDiscord, $t('discord'))}
          </div>
          <!-- BRANDING:UPSTREAM_END -->
          <div>
            <button type="button" class="ws-sheet-quiet" onclick={showServerDetails} data-testid="help-server-details">
              <Icon icon={mdiServerOutline} size="18" aria-hidden />
              {$t('help_server_details')}
            </button>
          </div>
        </section>
      {/if}

      {#if info}
        <section class="ws-sheet-section ws-help-version">
          <p>
            <span class="ws-help-version-label">{$t('version')}</span>
            <span class="ws-help-version-value" data-testid="help-version">{info.version}</span>
          </p>
        </section>
      {/if}
    </div>
  </ModalBody>
</Modal>

<style>
  /* the person heading the sheet, as the account menu draws them: a quiet ring with the initial in ink */
  .ws-help-who {
    display: flex;
    gap: 0.75rem;
    align-items: center;
    min-height: 2.5rem;
  }
  .ws-help-face {
    flex: none;
  }
  .ws-help-face > :global(figure) {
    background: var(--immich-ui-light);
    color: var(--immich-ui-dark);
    box-shadow: inset 0 0 0 1px color-mix(in oklab, var(--immich-ui-dark) 38%, transparent);
  }
  /* the way to reach them, in ink, with where it goes in data type beside it */
  .ws-help-contact {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem 0.9rem;
    align-items: center;
    margin-top: 0.35rem;
  }
  .ws-help-address {
    min-width: 0;
    overflow-wrap: anywhere;
    color: var(--immich-ui-muted);
    font-family: var(--ws-font-data);
    font-size: var(--ws-text-data);
    font-weight: 600;
  }
  /* a link to read elsewhere: a quiet row, the icon muted, an underline that takes the accent when pointed at */
  .ws-help-links {
    display: grid;
    justify-items: start;
    gap: 0.15rem;
  }
  .ws-help-link {
    display: inline-flex;
    gap: 0.6rem;
    align-items: center;
    min-height: 2rem;
    color: var(--immich-ui-dark);
    font-size: var(--ws-text-ui);
    font-weight: 500;
  }
  .ws-help-link span {
    text-decoration: underline;
    text-decoration-color: var(--ws-hairline);
    text-underline-offset: 0.25em;
  }
  .ws-help-link:hover span {
    text-decoration-color: var(--ws-accent);
  }
  .ws-help-link :global(svg) {
    flex: none;
    color: var(--immich-ui-muted);
  }
  .ws-help-link:focus-visible {
    outline: var(--ws-border) solid var(--ws-accent);
    outline-offset: 2px;
  }
  .ws-help-group {
    margin-top: 0.4rem;
    color: var(--immich-ui-muted);
    font-size: var(--ws-text-meta);
    font-weight: 600;
  }
  /* the version, for whoever is asked what is running: its label in muted meta, the number in data type */
  .ws-help-version p {
    display: flex;
    gap: 0.6rem;
    align-items: baseline;
    color: var(--immich-ui-muted);
    font-size: var(--ws-text-meta);
  }
  .ws-help-version-value {
    color: var(--immich-ui-dark);
    font-family: var(--ws-font-data);
    font-size: var(--ws-text-data);
    font-weight: 600;
  }
</style>
