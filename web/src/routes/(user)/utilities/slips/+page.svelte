<script lang="ts">
  // Local Omarchy layer: Utilities › Bank slips. The user: "where are all the qr codes stored ... they should all be in
  // one album similar to villa and todo called QR and i need a tool maybe under utilities that uses ai to read each
  // one, check amount and if its under a certain amount I can set, lets say 3000 baht they will be deleted", then
  // "any amount below 3000 delete it or move it to QR or any amount between 50,000 and 80,000 move it to QR or delete
  // it so it should be flexible". Curator finds the slips and reads each amount twice, from Gallery's text recognition
  // and with the vision model (jobs/slips.py). Here a rule picks what to do (into QR, managers/special-albums, or to the
  // Trash) with which amounts (any, under, over, between), and a grid shows the slips it takes, each with its amount; a
  // click leaves one out. A rule on amounts takes only slips whose two readings agree: one read once, or read two
  // ways, waits under "Check these" until clicked in; a code without an amount never goes to the Trash. The Trash
  // keeps them 30 days, and Undo brings back either move.
  import UserPageLayout from '$lib/components/layouts/UserPageLayout.svelte';
  import LoadingSpinner from '$lib/components/shared-components/LoadingSpinner.svelte';
  import { authManager } from '$lib/managers/auth-manager.svelte';
  import { qrManager } from '$lib/managers/special-albums.svelte';
  import { undoManager } from '$lib/managers/undo-manager.svelte';
  import { slipsRule, type SlipsRule } from '$lib/stores/preferences.store';
  import { getAssetMediaUrl } from '$lib/utils';
  import { curator, waitForJob, type Slip, type SlipList } from '$lib/utils/curator';
  import { handleError } from '$lib/utils/handle-error';
  import { toastUndoable } from '$lib/utils/undoable';
  import { AssetMediaSize, deleteAssets as trashAssets, restoreAssets } from '@immich/sdk';
  import { Field, Icon, modalManager, Switch } from '@immich/ui';
  import { mdiRefresh } from '@mdi/js';
  import { onMount, untrack } from 'svelte';
  import { locale, t } from 'svelte-i18n';
  import { SvelteSet } from 'svelte/reactivity';
  import type { PageData } from './$types';

  type Props = {
    data: PageData;
  };

  let { data }: Props = $props();

  let list = $state<SlipList>();
  let offline = $state(false);
  let busy = $state(false);
  let refreshing = $state(false);
  let loadedAt = $state<Date>();
  let reading = $state<{ done: number; total: number }>();
  /** slips the rule takes that a person left out, and ones to check that a person added */
  const left = new SvelteSet<string>();
  const added = new SvelteSet<string>();

  const rule = $derived($slipsRule);
  // what to do is never remembered: every visit starts on Move to QR, so a rule set for the Trash once is not waiting,
  // ready to go, the next time (the ranges and their numbers are remembered)
  let action = $state<'qr' | 'trash'>('qr');
  const mine = $derived(
    (list?.slips ?? []).filter((slip) => authManager.authenticated && slip.owner_id === authManager.user.id),
  );
  const inQr = $derived(mine.filter((slip) => slip.in_qr).length);

  /** whether an amount is one the rule names */
  const fits = (value: number | null, { mode, under, over, from, to }: SlipsRule) => {
    if (value === null) {
      return false;
    }
    switch (mode) {
      case 'any': {
        return true;
      }
      case 'under': {
        return under !== null && value < under;
      }
      // at least: so Under 3,000 and At least 3,000 leave no slip between them (four of exactly 3,000 had been missed)
      case 'over': {
        return over !== null && value >= over;
      }
      case 'between': {
        const low = Math.min(from ?? 0, to ?? Infinity);
        const high = Math.max(from ?? 0, to ?? Infinity);
        return value >= low && value <= high;
      }
    }
  };

  // into QR: the slips it does not hold yet (any amount: every one of them, whatever it says); to the Trash: any slip
  const candidates = $derived(action === 'qr' ? mine.filter((slip) => !slip.in_qr) : mine);
  const everything = $derived(action === 'qr' && rule.mode === 'any');
  const taken = $derived(
    everything ? candidates : candidates.filter((slip) => slip.status === 'agree' && fits(slip.amount, rule)),
  );
  const check = $derived(
    everything
      ? []
      : candidates.filter(
          (slip) =>
            (slip.status === 'differ' || slip.status === 'single') &&
            (fits(slip.amount, rule) || fits(slip.checked, rule)),
        ),
  );
  const going = $derived([
    ...taken.filter((slip) => !left.has(slip.id)),
    ...check.filter((slip) => added.has(slip.id)),
  ]);
  const alreadyInQr = $derived(
    action === 'qr'
      ? mine.filter((slip) => slip.in_qr && (everything || (slip.status === 'agree' && fits(slip.amount, rule)))).length
      : 0,
  );
  const noAmount = $derived(mine.filter((slip) => slip.status === 'none').length);
  /** slips the action could take that this rule does not */
  const outside = $derived(candidates.length - taken.length - check.length);

  // an amount applies once typing pauses (or on Enter, or leaving the field), not at every keystroke: the grid of
  // hundreds of slips no longer jumps through 3, 30 and 300 on the way to 3000
  let typing: ReturnType<typeof setTimeout> | undefined;
  const setAmount = (field: 'under' | 'over' | 'from' | 'to', raw: string, now = false) => {
    clearTimeout(typing);
    const value = raw.trim() === '' ? null : Number(raw);
    const write = () =>
      ($slipsRule = { ...$slipsRule, [field]: value !== null && Number.isFinite(value) ? value : null });
    if (now) {
      write();
    } else {
      typing = setTimeout(write, 400);
    }
  };
  const unread = $derived(mine.filter((slip) => slip.checked === null && slip.status !== 'none').length);

  // a new rule starts with nothing left out or added
  const ruleKey = $derived(`${action}:${rule.mode}`);
  $effect(() => {
    if (ruleKey) {
      untrack(() => {
        left.clear();
        added.clear();
      });
    }
  });

  const modes = ['any', 'under', 'over', 'between'] as const;
  const modeLabel = {
    any: 'slips_mode_any',
    under: 'slips_mode_under',
    over: 'slips_mode_over',
    between: 'slips_mode_between',
  } as const;

  /** ฿ in every language (English would write THB); satang only where there are any, never on a total */
  const money = (value: number | null, whole = false) => {
    if (value === null) {
      return '–';
    }
    const digits = whole || Number.isSafeInteger(value) ? 0 : 2;
    const options = {
      style: 'currency',
      currency: 'THB',
      currencyDisplay: 'narrowSymbol',
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    } as const;
    try {
      return new Intl.NumberFormat($locale ?? undefined, options).format(value);
    } catch {
      return new Intl.NumberFormat(undefined, options).format(value);
    }
  };

  const summary = $derived.by(() => {
    const values = {
      count: taken.length,
      total: money(
        taken.reduce((sum, slip) => sum + (slip.amount ?? 0), 0),
        true,
      ),
      amount: money(rule.mode === 'over' ? rule.over : rule.under),
      from: money(Math.min(rule.from ?? 0, rule.to ?? Infinity)),
      to: money(rule.to === null ? null : Math.max(rule.from ?? 0, rule.to)),
    };
    const key = {
      any: 'slips_match_any',
      under: 'slips_match_under',
      over: 'slips_match_over',
      between: 'slips_match_between',
    } as const;
    return $t(key[rule.mode], { values });
  });

  const thumbnail = (id: string) => getAssetMediaUrl({ id, size: AssetMediaSize.Thumbnail });
  const preview = (id: string) => getAssetMediaUrl({ id, size: AssetMediaSize.Preview });

  const load = async () => {
    try {
      list = await curator.slips();
      loadedAt = new Date();
      offline = false;
    } catch {
      offline = true;
    }
  };

  // the list as Curator has it now ("can we have a refresh button so i can refresh the list to make sure the selection
  // is correct"); slips left out or added stay so, the rest follows the fresh list
  const refresh = async () => {
    if (refreshing) {
      return;
    }
    refreshing = true;
    try {
      await load();
    } finally {
      refreshing = false;
    }
  };

  const follow = async (id: number) => {
    reading = { done: 0, total: 0 };
    try {
      await waitForJob(id, (job) => (reading = { done: job.progress.done ?? 0, total: job.progress.total ?? 0 }));
    } catch (error) {
      handleError(error, $t('ai_inbox_offline_title'));
    } finally {
      reading = undefined;
      await load();
    }
  };

  const read = async () => {
    try {
      const { id } = await curator.startJob('slips.read');
      await follow(id);
    } catch (error) {
      handleError(error, $t('ai_inbox_offline_title'));
    }
  };

  // into QR the special album's own way: album, tag and out of Photos, with its toast and undo
  const toQr = async (slips: Slip[]) => {
    await qrManager.move(slips.map(({ id, visibility, owner_id }) => ({ id, visibility, ownerId: owner_id })));
  };

  const toTrash = async (slips: Slip[]) => {
    const ids = slips.map(({ id }) => id);
    const confirmed = await modalManager.showDialog({
      title: $t('slips_trash', { values: { count: ids.length } }),
      prompt: $t('slips_trash_confirm', { values: { count: ids.length } }),
    });
    if (!confirmed) {
      return;
    }
    try {
      await trashAssets({ assetBulkDeleteDto: { ids, force: false } });
      const label = $t('slips_trashed', { values: { count: ids.length } });
      const entry = undoManager.record(
        label,
        async () => {
          await restoreAssets({ bulkIdsDto: { ids } });
          await load();
        },
        $t('errors.unable_to_restore_assets'),
      );
      toastUndoable(label, entry);
    } catch (error) {
      handleError(error, $t('errors.unable_to_delete_assets'));
    }
  };

  const apply = async () => {
    const chosen = going;
    if (chosen.length === 0 || busy) {
      return;
    }
    busy = true;
    try {
      await (action === 'qr' ? toQr(chosen) : toTrash(chosen));
      left.clear();
      added.clear();
      await load();
    } finally {
      busy = false;
    }
  };

  const toggle = (set: SvelteSet<string>, id: string) => (set.has(id) ? set.delete(id) : set.add(id));

  // new slips and QR codes into QR as they arrive (Curator's qr.watch), or left for this page
  const setAuto = async (enabled: boolean) => {
    if (!list) {
      return;
    }
    const before = list.auto;
    list.auto = enabled;
    try {
      await curator.setSlipsAuto(enabled);
    } catch (error) {
      list.auto = before;
      handleError(error, $t('ai_inbox_offline_title'));
    }
  };

  // resting the pointer on a slip shows it large, so its amount can be read off the slip itself
  let peek = $state<string>();
  let peekTimer: ReturnType<typeof setTimeout> | undefined;
  const peekAt = (id: string) => {
    clearTimeout(peekTimer);
    peekTimer = setTimeout(() => (peek = id), 300);
  };
  const unpeek = () => {
    clearTimeout(peekTimer);
    peek = undefined;
  };

  onMount(async () => {
    await load();
    if (list?.reading) {
      await follow(list.reading);
    }
  });
</script>

<svelte:window onscroll={unpeek} />

{#snippet tile(slip: Slip, out: boolean, onclick: () => void, readings = false)}
  <button
    type="button"
    class="ws-slip"
    class:ws-slip-out={!out}
    aria-pressed={out}
    {onclick}
    onmouseenter={() => peekAt(slip.id)}
    onmouseleave={unpeek}
  >
    <img src={thumbnail(slip.id)} alt="" loading="lazy" />
    <span class="ws-slip-amount">
      {#if readings}
        {$t('slips_readings', { values: { text: money(slip.amount), ai: money(slip.checked) } })}
      {:else}
        {money(slip.amount)}
      {/if}
    </span>
    {#if !out && !readings}
      <span class="ws-slip-keep">{$t('slips_left_out')}</span>
    {/if}
  </button>
{/snippet}

{#snippet amountField(field: 'under' | 'over' | 'from' | 'to')}
  <span class="ws-slips-amount">
    <input
      type="number"
      min="0"
      step="100"
      inputmode="numeric"
      value={rule[field] ?? ''}
      oninput={(event) => setAmount(field, event.currentTarget.value)}
      onchange={(event) => setAmount(field, event.currentTarget.value, true)}
    />
    <span aria-hidden="true">฿</span>
  </span>
{/snippet}

<UserPageLayout title={data.meta.title}>
  <div class="ws-sharing ws-slips">
    {#if offline}
      <div class="ws-empty">
        <h2 class="ws-empty-title">{$t('ai_inbox_offline_title')}</h2>
        <p class="ws-empty-body">{$t('ai_inbox_offline_body')}</p>
      </div>
    {:else if !list}
      <div class="ws-slips-loading"><LoadingSpinner /></div>
    {:else if mine.length === 0}
      <p class="ws-sharing-none">{$t('slips_empty')}</p>
    {:else}
      <section class="ws-sharing-section" aria-labelledby="slips-qr">
        <h2 class="ws-sharing-heading" id="slips-qr">
          {$t('qr')} <span class="ws-inbox-meta">{inQr} / {mine.length}</span>
          <a class="ws-sharing-heading-action" href={qrManager.route}>{$t('view')}</a>
        </h2>
        <div class="ws-slips-auto">
          <Field label={$t('slips_auto')}>
            <Switch checked={list.auto} onCheckedChange={setAuto} data-testid="slips-auto" />
          </Field>
          <p class="ws-sharing-none">{$t('slips_auto_hint')}</p>
        </div>
      </section>

      <section class="ws-sharing-section" aria-labelledby="slips-amounts">
        <h2 class="ws-sharing-heading" id="slips-amounts">
          {$t('slips_amounts')}
          {#if reading}
            <span class="ws-inbox-meta"
              >{$t('slips_reading', { values: { done: reading.done, total: reading.total } })}</span
            >
          {:else if unread > 0}
            <span class="ws-inbox-meta">{$t('slips_unread', { values: { count: unread } })}</span>
          {/if}
          <span class="ws-slips-heading-actions">
            {#if loadedAt}
              <span class="ws-inbox-meta" data-testid="slips-loaded-at"
                >{$t('updated_at')} {loadedAt.toLocaleTimeString($locale ?? undefined)}</span
              >
            {/if}
            {#if !reading && unread > 0}
              <button type="button" class="ws-sharing-heading-action" onclick={read}>{$t('slips_read')}</button>
            {/if}
            <button type="button" class="ws-sharing-heading-action" disabled={refreshing} onclick={refresh}>
              <Icon icon={mdiRefresh} size="16" class={refreshing ? 'animate-spin' : undefined} />
              {$t('refresh')}
            </button>
          </span>
        </h2>

        <div class="ws-slips-rule">
          <div class="ws-seg" role="group" aria-label={$t('slips_action')}>
            <button type="button" aria-pressed={action === 'qr'} onclick={() => (action = 'qr')}>{$t('qr_move')}</button
            >
            <button type="button" aria-pressed={action === 'trash'} onclick={() => (action = 'trash')}
              >{$t('slips_action_trash')}</button
            >
          </div>
          <div class="ws-seg" role="group" aria-label={$t('slips_range')}>
            {#each modes as mode (mode)}
              <button type="button" aria-pressed={rule.mode === mode} onclick={() => ($slipsRule = { ...rule, mode })}>
                {$t(modeLabel[mode])}
              </button>
            {/each}
          </div>
          {#if rule.mode === 'under'}
            {@render amountField('under')}
          {:else if rule.mode === 'over'}
            {@render amountField('over')}
          {:else if rule.mode === 'between'}
            {@render amountField('from')}
            <span>{$t('slips_and')}</span>
            {@render amountField('to')}
          {/if}
        </div>

        {#if taken.length > 0}
          <p class="ws-sharing-none">
            {summary}
            {everything ? $t('slips_click_hint') : $t('slips_match_hint')}
          </p>
          <div class="ws-slips-grid">
            {#each taken as slip (slip.id)}
              {@render tile(slip, !left.has(slip.id), () => toggle(left, slip.id))}
            {/each}
          </div>
        {:else}
          <p class="ws-sharing-none">{$t('slips_none_match')}</p>
        {/if}
        {#if outside > 0}
          <p class="ws-inbox-meta">{$t('slips_outside_rule', { values: { count: outside } })}</p>
        {/if}

        {#if check.length > 0}
          <h3 class="ws-slips-subheading">
            {$t('slips_look')} <span class="ws-inbox-meta">{check.length}</span>
          </h3>
          <p class="ws-sharing-none">{$t('slips_look_hint')}</p>
          <div class="ws-slips-grid">
            {#each check as slip (slip.id)}
              {@render tile(slip, added.has(slip.id), () => toggle(added, slip.id), true)}
            {/each}
          </div>
        {/if}

        {#if alreadyInQr > 0}
          <p class="ws-inbox-meta ws-slips-stay">{$t('slips_in_qr_already', { values: { count: alreadyInQr } })}</p>
        {:else if action === 'trash' && noAmount > 0}
          <p class="ws-inbox-meta ws-slips-stay">{$t('slips_never', { values: { count: noAmount } })}</p>
        {/if}

        <div class="ws-empty-actions">
          <button
            type="button"
            class="ws-empty-action"
            class:ws-slips-trash={action === 'trash'}
            disabled={going.length === 0 || busy}
            onclick={apply}
          >
            {action === 'qr'
              ? $t('slips_move_qr', { values: { count: going.length } })
              : $t('slips_trash', { values: { count: going.length } })}
          </button>
          {#if busy}<LoadingSpinner />{/if}
        </div>
      </section>
    {/if}
  </div>
</UserPageLayout>

{#if peek}
  <div class="ws-slip-peek" aria-hidden="true"><img src={preview(peek)} alt="" /></div>
{/if}

<style>
  /* the heading's actions at its end, side by side: when the list was loaded, Read amounts, Refresh */
  .ws-slips-heading-actions {
    display: inline-flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.6rem;
    margin-inline-start: auto;
  }
  .ws-slips-heading-actions .ws-sharing-heading-action {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    margin-inline-start: 0;
  }
  .ws-slips-heading-actions .ws-sharing-heading-action:disabled {
    opacity: 0.6;
    cursor: progress;
  }
  .ws-slips-auto {
    display: grid;
    gap: 0.4rem;
    max-width: 60ch;
  }
  .ws-slips-loading {
    display: flex;
    justify-content: center;
    padding: 4rem 0;
  }
  .ws-slips-rule {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.6rem 1rem;
    margin-bottom: calc(var(--ws-gap) * 1.2);
    font-size: var(--ws-text-ui);
    font-weight: 600;
  }
  /* the bar's segmented control, here at the start of the row rather than pushed to the end */
  .ws-slips-rule .ws-seg {
    margin-inline-start: 0;
  }
  .ws-slips-amount {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
  }
  .ws-slips-amount input {
    width: 8rem;
    padding: 0.35rem 0.6rem;
    border: 1px solid var(--ws-hairline);
    border-radius: var(--ws-radius);
    background: transparent;
    font-family: var(--ws-font-data);
    font-variant-numeric: tabular-nums;
  }
  .ws-slips-amount input:focus-visible {
    outline: var(--ws-border) solid var(--ws-accent);
    outline-offset: calc(var(--ws-border) * -1);
  }
  .ws-slips-subheading {
    display: flex;
    align-items: baseline;
    gap: 0.6rem;
    margin: 2rem 0 0.4rem;
    font-size: var(--ws-text-ui);
    font-weight: 600;
  }
  .ws-slips-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(7rem, 1fr));
    gap: calc(var(--ws-gap) * 0.5);
    margin-top: calc(var(--ws-gap) * 1.2);
  }
  .ws-slip {
    position: relative;
    display: block;
    aspect-ratio: 3 / 5;
    overflow: hidden;
    border-radius: var(--ws-radius);
    outline: 1px solid var(--ws-hairline);
    outline-offset: -1px;
    background: color-mix(in oklab, var(--immich-ui-dark) 6%, transparent);
  }
  .ws-slip img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    object-position: center top;
  }
  .ws-slip:hover,
  .ws-slip:focus-visible {
    outline: var(--ws-border) solid var(--ws-accent);
    outline-offset: calc(var(--ws-border) * -1);
  }
  /* a slip that stays (left out, or not added) steps back; the ones going keep their colour */
  .ws-slip-out img {
    opacity: 0.35;
    filter: grayscale(1);
  }
  .ws-slip-amount {
    position: absolute;
    inset-inline: 0;
    bottom: 0;
    padding: 0.3rem 0.45rem;
    background: var(--ws-glass-strong);
    color: #fff;
    font-family: var(--ws-font-data);
    font-size: var(--ws-text-data);
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    text-align: start;
  }
  .ws-slip-keep {
    position: absolute;
    inset-inline-start: 0.4rem;
    top: 0.4rem;
    padding: 0.15rem 0.45rem;
    border-radius: var(--ws-radius);
    background: var(--ws-accent);
    color: var(--immich-ui-light);
    font-size: var(--ws-text-micro);
    font-weight: 700;
  }
  .ws-slips-stay {
    margin-top: 1.5rem;
  }
  /* the danger role under the surface's text (omarchy-world.css); hovered it goes toward the ink, as the ink buttons
     go toward the accent */
  .ws-slips-trash {
    background: var(--ws-danger);
  }
  .ws-slips-trash:hover {
    background: color-mix(in oklab, var(--ws-danger) 85%, var(--immich-ui-dark));
  }
  .ws-empty-action:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
  .ws-slip-peek {
    position: fixed;
    inset-block: 10vh;
    inset-inline-end: 4vw;
    z-index: 50;
    pointer-events: none;
  }
  .ws-slip-peek img {
    height: 100%;
    width: auto;
    border-radius: var(--ws-radius);
    box-shadow: 0 1rem 3rem rgb(0 0 0 / 0.45);
  }
</style>
