<script lang="ts">
  import Logo from '$lib/components/shared-components/Logo.svelte';
  import { authManager } from '$lib/managers/auth-manager.svelte';
  import { curatorIsMine } from '$lib/utils/curator';
  import { shortcutSections, type KeyCombo, type ShortcutSection } from '$lib/utils/shortcut-sheet';
  import { CardTitle, CloseButton, Modal, ModalBody, ModalHeader } from '@immich/ui';
  import { t } from 'svelte-i18n';

  interface Props {
    onClose: () => void;
    /** a page's own keys instead of the whole sheet (Duplicates) */
    sections?: ShortcutSection[];
  }

  // Local Omarchy layer: the keys grouped by where they work (utils/shortcut-sheet), each row only for an account it
  // works for, the sections in columns as the dialog allows; a page with keys of its own passes its sections instead,
  // and a section or two take a narrow dialog
  let { onClose, sections }: Props = $props();

  const signedIn = $derived(authManager.authenticated && !authManager.isSharedLink);
  const shown = $derived(
    sections ??
      shortcutSections($t, {
        signedIn,
        owner: signedIn && authManager.user.isAdmin,
        curator: curatorIsMine(),
        ratings: signedIn && authManager.preferences.ratings.enabled,
        tags: signedIn && authManager.preferences.tags.enabled,
      }),
  );
  // the search palette's prefixes, with the whole sheet
  const prefixes = $derived(
    sections
      ? []
      : [
          { key: '@', action: $t('cmdk_shortcut_scope_people') },
          { key: '#', action: $t('cmdk_shortcut_scope_tags') },
          { key: '/', action: $t('cmdk_shortcut_scope_collections') },
          { key: '>', action: $t('cmdk_shortcut_scope_nav') },
        ],
  );
</script>

{#snippet combo(keys: KeyCombo)}
  <span class="ws-keys-combo">
    {#each keys as key, index (index)}
      {#if key === 'Shift'}
        <kbd><span aria-hidden="true">⇧</span><span class="sr-only">{$t('shortcut_key_shift')}</span></kbd>
      {:else if key === 'click' || key === 'middle-click'}
        <kbd class="ws-keys-pointer">{$t(key === 'click' ? 'shortcut_click' : 'shortcut_middle_click')}</kbd>
      {:else}
        <kbd>{key}</kbd>
      {/if}
    {/each}
  </span>
{/snippet}

<Modal title={$t('keyboard_shortcuts')} size={shown.length > 2 ? 'giant' : 'small'} {onClose}>
  <ModalHeader>
    <div class="flex items-center justify-between gap-2">
      <Logo variant="icon" size="tiny" />
      <CardTitle tag="p" class="grow text-lg font-semibold text-dark/90 dark:text-white/90">
        {$t('keyboard_shortcuts')}
      </CardTitle>
      <CloseButton class="-me-2" onclick={onClose} />
    </div>
  </ModalHeader>
  <ModalBody>
    <div class="ws-keys" data-testid="shortcuts-sheet">
      {#each shown as section (section.id)}
        <section class="ws-keys-section" data-testid="shortcuts-{section.id}">
          <h2 class="ws-keys-title">{section.title}</h2>
          <dl class="ws-keys-list">
            {#each section.rows as shortcut, index (index)}
              <div class="ws-keys-row">
                <dt class="ws-keys-keys">
                  {#each shortcut.keys as keys, at (at)}
                    {#if at > 0}<span class="ws-keys-or"
                        ><span aria-hidden="true">/</span><span class="sr-only">{$t('or')}</span></span
                      >{/if}
                    {@render combo(keys)}
                  {/each}
                </dt>
                <dd class="ws-keys-action">
                  {shortcut.action}
                  {#if shortcut.note}
                    <span class="ws-keys-note">{shortcut.note}</span>
                  {/if}
                </dd>
              </div>
            {/each}
          </dl>
        </section>
      {/each}
      {#if prefixes.length > 0}
        <section class="ws-keys-section" data-testid="shortcuts-prefixes">
          <h2 class="ws-keys-title">{$t('cmdk_shortcut_scope_heading')}</h2>
          <dl class="ws-keys-list">
            {#each prefixes as prefix (prefix.key)}
              <div class="ws-keys-row">
                <dt class="ws-keys-keys">{@render combo([prefix.key])}</dt>
                <dd class="ws-keys-action">{prefix.action}</dd>
              </div>
            {/each}
          </dl>
        </section>
      {/if}
    </div>
  </ModalBody>
</Modal>

<style>
  /* the sections flow in columns as the dialog allows, each kept whole; a section is a heading over a hairline, then
     its rows: the keys in the desktop's mono, each framed in a hairline, and what they do */
  .ws-keys {
    columns: 17rem;
    column-gap: 2.5rem;
    padding: 0 0.25rem 0.5rem;
  }
  .ws-keys-section {
    break-inside: avoid;
    margin-block-end: 1.5rem;
  }
  .ws-keys-title {
    margin-block-end: 0.5rem;
    padding-block-end: 0.4rem;
    border-block-end: 1px solid var(--ws-hairline);
    color: var(--immich-ui-dark);
    font-size: var(--ws-text-ui);
    font-weight: 650;
  }
  .ws-keys-list {
    display: grid;
    gap: 0.45rem;
    margin: 0;
  }
  .ws-keys-row {
    display: grid;
    grid-template-columns: 8.25rem minmax(0, 1fr);
    gap: 0.75rem;
    align-items: baseline;
  }
  .ws-keys-keys {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem;
    align-items: baseline;
  }
  .ws-keys-combo {
    display: inline-flex;
    gap: 0.15rem;
  }
  .ws-keys kbd {
    display: inline-block;
    min-width: 1.5rem;
    padding: 0.05rem 0.35rem;
    border: 1px solid var(--ws-hairline);
    border-radius: var(--ws-radius);
    color: var(--immich-ui-dark);
    font-family: var(--ws-font-data);
    font-size: var(--ws-text-data);
    font-weight: 600;
    line-height: 1.5;
    text-align: center;
    white-space: nowrap;
  }
  .ws-keys .ws-keys-pointer {
    font-family: var(--font-sans);
    font-weight: 500;
  }
  .ws-keys-or {
    color: var(--immich-ui-muted);
    font-family: var(--ws-font-data);
    font-size: var(--ws-text-data);
  }
  .ws-keys-action {
    margin: 0;
    color: var(--immich-ui-dark);
    font-size: var(--ws-text-ui);
    line-height: 1.4;
  }
  .ws-keys-note {
    display: block;
    color: var(--immich-ui-muted);
    font-size: var(--ws-text-meta);
  }
</style>
