<script lang="ts">
  // Local Omarchy layer: the family page in Coming up (gallery/series; the design's section 4), one section under the
  // page's quiet line. Before it is made: what the family gets, day 1 (today or later, saved as it is chosen), a switch
  // that asks for a password (on, as decided: D2) and Make the family link. Live: the page's address, the public one the
  // Share sheets give out (asUrl: the external domain, /share/<key>), Copy link, New link and Turn off, which the page
  // asks about first. Off, once it was turned off (or Gallery no longer has the link Curator holds): it says so, with
  // the password switch again and Make a new family link. The link itself is series-state's to make and delete. What
  // the page gives under these (the family page's title: SeriesTitle) closes the section.
  import { asUrl } from '$lib/services/shared-link.service';
  import { handleError } from '$lib/utils/handle-error';
  import type { SharedLinkResponseDto } from '@immich/sdk';
  import { Field, Icon, Input, PasswordInput, Switch } from '@immich/ui';
  import { mdiCheck, mdiContentCopy } from '@mdi/js';
  import { onDestroy, tick, type Snippet } from 'svelte';
  import { t } from 'svelte-i18n';
  import type { Coming } from './series-api';
  import { isoDay } from './series-days';
  import type { SeriesLinking } from './series-state.svelte';

  type Props = {
    coming: Coming;
    /** the link as Gallery holds it: undefined while it is asked, null where Gallery has none by Curator's id */
    link: SharedLinkResponseDto | null | undefined;
    /** what is under way for the page */
    linking?: SeriesLinking;
    /** turned off while this page was open */
    turnedOff?: boolean;
    onDayOne: (day: string) => void;
    /** make the link: its password, if any, and day 1 while it is still to be set */
    onMake: (password: string | undefined, dayOne?: string) => void;
    onNewLink: () => void;
    /** asks first, then turns the page off */
    onTurnOff: () => void;
    /** more of the family page, after its link */
    children?: Snippet;
  };

  let { coming, link, linking, turnedOff = false, onDayOne, onMake, onNewLink, onTurnOff, children }: Props = $props();

  const id = $props.id();
  /** how long Copy link says Copied */
  const COPIED_MS = 2000;

  // live while Curator holds a link that Gallery has (or is being asked for); off once it was turned off, once memories
  // went out before, or where Gallery no longer has Curator's link; before that, not made yet
  const phase = $derived.by(() => {
    if (coming.link_id && link !== null) {
      return 'live';
    }
    return coming.link_id || turnedOff || coming.sent_count > 0 ? 'off' : 'before';
  });
  const busy = $derived(!!linking);
  const dayOne = $derived(coming.series.starts_on ?? coming.first_day);
  const address = $derived(link ? asUrl(link) : undefined);
  const today = isoDay(new Date());

  let protect = $state(true);
  let password = $state('');
  let missing = $state(false);
  let passwordBox = $state<HTMLElement>();
  let copied = $state(false);
  let copiedTimer: ReturnType<typeof setTimeout> | undefined;

  const focusPassword = () => passwordBox?.querySelector('input')?.focus();

  const setProtect = async (on: boolean) => {
    protect = on;
    missing = false;
    if (on) {
      await tick();
      focusPassword();
    }
  };

  const make = () => {
    if (protect && !password) {
      missing = true;
      focusPassword();
      return;
    }
    onMake(protect ? password : undefined, phase === 'before' ? dayOne : undefined);
  };

  const copy = async () => {
    if (!address) {
      return;
    }
    try {
      await navigator.clipboard.writeText(address);
      copied = true;
      clearTimeout(copiedTimer);
      copiedTimer = setTimeout(() => (copied = false), COPIED_MS);
    } catch (error) {
      handleError(error, $t('errors.unable_to_copy_to_clipboard'));
    }
  };

  onDestroy(() => clearTimeout(copiedTimer));
</script>

<section
  class="ws-sharing-section"
  aria-labelledby="{id}-heading"
  aria-busy={busy || undefined}
  data-testid="series-family"
  data-state={phase}
>
  <h2 class="ws-sharing-heading" id="{id}-heading">{$t('memory_series_family_page')}</h2>
  {#if phase === 'live'}
    <p class="series-family-address" title={address} data-testid="series-family-address">{address ?? ''}</p>
    <div class="series-family-actions">
      <button type="button" class="ws-btn" disabled={!address || busy} onclick={copy}>
        <Icon icon={copied ? mdiCheck : mdiContentCopy} size="18" aria-hidden />
        {$t(copied ? 'memory_series_link_copied' : 'memory_series_link_copy')}
      </button>
      <button type="button" class="ws-btn-quiet" disabled={link === undefined || busy} onclick={onNewLink}>
        {$t('memory_series_link_new')}
      </button>
      <button type="button" class="ws-btn-quiet" disabled={busy} onclick={onTurnOff}>
        {$t('memory_series_turn_off')}
      </button>
    </div>
  {:else}
    <p class="ws-sharing-none" data-testid="series-family-words">
      {$t(phase === 'off' ? 'memory_series_family_off' : 'memory_series_family_about')}
    </p>
    <div class="series-family-form">
      {#if phase === 'before'}
        <div class="series-family-day">
          <Field label={$t('memory_series_day_one')} disabled={busy}>
            <Input
              type="date"
              min={today}
              value={dayOne}
              data-testid="series-family-day-one"
              onchange={(event) => onDayOne(event.currentTarget.value)}
            />
          </Field>
        </div>
      {/if}
      <div class="series-family-switch">
        <label for="input-{id}-protect">{$t('memory_series_password_ask')}</label>
        <Switch id="{id}-protect" checked={protect} disabled={busy} onCheckedChange={setProtect} />
      </div>
      {#if protect}
        <div class="series-family-password" bind:this={passwordBox}>
          <Field label={$t('password')} disabled={busy} invalid={missing}>
            <PasswordInput
              bind:value={password}
              autocomplete="new-password"
              aria-invalid={missing || undefined}
              aria-describedby={missing ? `${id}-missing` : undefined}
              oninput={() => (missing = false)}
            />
          </Field>
          {#if missing}
            <p class="series-family-missing" id="{id}-missing" role="alert">
              {$t('memory_series_password_missing')}
            </p>
          {/if}
        </div>
      {/if}
      <div class="series-family-actions">
        <button type="button" class="ws-btn" disabled={busy} onclick={make}>
          {$t(phase === 'off' ? 'memory_series_link_make_new' : 'memory_series_link_make')}
        </button>
      </div>
    </div>
  {/if}
  {@render children?.()}
</section>

<style>
  /* the address in data type, whole: it is what the family bookmarks */
  .series-family-address {
    max-width: 62ch;
    color: var(--immich-ui-dark);
    font-family: var(--ws-font-data);
    font-size: var(--ws-text-data);
    font-weight: 600;
    line-height: 1.5;
    word-break: break-all;
    user-select: all;
  }
  .series-family-form {
    display: grid;
    gap: 1rem;
    max-width: 24rem;
    margin-top: 1rem;
  }
  .series-family-day {
    max-width: 12rem;
  }
  .series-family-switch {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    font-size: var(--ws-text-ui);
    font-weight: 500;
  }
  .series-family-password {
    display: grid;
    gap: 0.5rem;
  }
  .series-family-missing {
    font-size: var(--ws-text-meta);
    font-weight: 500;
    color: var(--ws-danger);
  }
  .series-family-actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.25rem 0.5rem;
    margin-top: 0.75rem;
  }
  .series-family-form .series-family-actions {
    margin-top: 0;
  }
  .series-family-actions .ws-btn {
    margin-inline-end: 0.25rem;
  }
</style>
