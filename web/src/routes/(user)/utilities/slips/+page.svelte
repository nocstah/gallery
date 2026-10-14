<script lang="ts">
  // Local Omarchy layer: Utilities › Bank slips. The user: "where are all the qr codes stored ... they should all be in
  // one album similar to villa and todo called QR and i need a tool maybe under utilities that uses ai to read each
  // one, check amount and if its under a certain amount I can set, lets say 3000 baht they will be deleted". Curator
  // finds the slips and reads each amount twice, from Gallery's text recognition and with the vision model
  // (jobs/slips.py); this page files them into QR (managers/special-albums) and sends the ones under the amount to the
  // Trash, but only those whose two readings agree. A slip read once, or read two ways, waits under "Check these" for a
  // person to look; one without an amount (a code to receive money) is never offered. The Trash keeps them 30 days,
  // and Undo brings them back.
  import UserPageLayout from '$lib/components/layouts/UserPageLayout.svelte';
  import LoadingSpinner from '$lib/components/shared-components/LoadingSpinner.svelte';
  import { authManager } from '$lib/managers/auth-manager.svelte';
  import { qrManager } from '$lib/managers/special-albums.svelte';
  import { undoManager } from '$lib/managers/undo-manager.svelte';
  import { slipsThreshold } from '$lib/stores/preferences.store';
  import { getAssetMediaUrl } from '$lib/utils';
  import { curator, waitForJob, type Slip, type SlipList } from '$lib/utils/curator';
  import { handleError } from '$lib/utils/handle-error';
  import { toastUndoable } from '$lib/utils/undoable';
  import { AssetMediaSize, deleteAssets as trashAssets, restoreAssets } from '@immich/sdk';
  import { modalManager } from '@immich/ui';
  import { onMount } from 'svelte';
  import { locale, t } from 'svelte-i18n';
  import { SvelteSet } from 'svelte/reactivity';
  import type { PageData } from './$types';

  type Props = {
    data: PageData;
  };

  let { data }: Props = $props();

  let list = $state<SlipList>();
  let offline = $state(false);
  let filing = $state(false);
  let trashing = $state(false);
  let reading = $state<{ done: number; total: number }>();
  /** agreeing slips under the amount that stay anyway, and ones to check that a person added */
  const kept = new SvelteSet<string>();
  const added = new SvelteSet<string>();

  const mine = $derived(
    (list?.slips ?? []).filter((slip) => authManager.authenticated && slip.owner_id === authManager.user.id),
  );
  const outside = $derived(mine.filter((slip) => !slip.in_qr));
  const threshold = $derived(Math.max(0, Number($slipsThreshold) || 0));
  const lowest = (slip: Slip) => Math.min(slip.amount ?? Infinity, slip.checked ?? Infinity);
  const under = $derived(mine.filter((slip) => slip.status === 'agree' && slip.amount! < threshold));
  const check = $derived(
    mine.filter((slip) => (slip.status === 'differ' || slip.status === 'single') && lowest(slip) < threshold),
  );
  const going = $derived([
    ...under.filter((slip) => !kept.has(slip.id)),
    ...check.filter((slip) => added.has(slip.id)),
  ]);
  const over = $derived(mine.filter((slip) => slip.status !== 'none' && lowest(slip) >= threshold).length);
  const none = $derived(mine.filter((slip) => slip.status === 'none').length);
  const unread = $derived(mine.filter((slip) => slip.checked === null && slip.status !== 'none').length);

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

  const thumbnail = (id: string) => getAssetMediaUrl({ id, size: AssetMediaSize.Thumbnail });
  const preview = (id: string) => getAssetMediaUrl({ id, size: AssetMediaSize.Preview });

  const load = async () => {
    try {
      list = await curator.slips();
      offline = false;
    } catch {
      offline = true;
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

  // into QR the special album's own way: album, tag and out of Photos (they are archived already), with its toast
  // and undo
  const fileAll = async () => {
    filing = true;
    try {
      await qrManager.move(outside.map(({ id, visibility, owner_id }) => ({ id, visibility, ownerId: owner_id })));
      await load();
    } finally {
      filing = false;
    }
  };

  const trash = async () => {
    const ids = going.map(({ id }) => id);
    if (ids.length === 0 || trashing) {
      return;
    }
    const confirmed = await modalManager.showDialog({
      title: $t('slips_trash', { values: { count: ids.length } }),
      prompt: $t('slips_trash_confirm', { values: { count: ids.length } }),
    });
    if (!confirmed) {
      return;
    }
    trashing = true;
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
      kept.clear();
      added.clear();
      await load();
    } catch (error) {
      handleError(error, $t('errors.unable_to_delete_assets'));
    } finally {
      trashing = false;
    }
  };

  const toggle = (set: SvelteSet<string>, id: string) => (set.has(id) ? set.delete(id) : set.add(id));

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
      <span class="ws-slip-keep">{$t('slips_keep')}</span>
    {/if}
  </button>
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
          {$t('qr')} <span class="ws-inbox-meta">{mine.length - outside.length} / {mine.length}</span>
          <a class="ws-sharing-heading-action" href={qrManager.route}>{$t('view')}</a>
        </h2>
        {#if outside.length > 0}
          <p class="ws-sharing-none">{$t('slips_outside', { values: { count: outside.length } })}</p>
          <div class="ws-empty-actions">
            <button type="button" class="ws-empty-action" disabled={filing} onclick={fileAll}>
              {$t('slips_file', { values: { count: outside.length } })}
            </button>
            {#if filing}<LoadingSpinner />{/if}
          </div>
        {:else}
          <p class="ws-sharing-none">{$t('slips_all_filed')}</p>
        {/if}
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
            <button type="button" class="ws-sharing-heading-action" onclick={read}>{$t('slips_read')}</button>
          {/if}
        </h2>

        <label class="ws-slips-threshold">
          <span>{$t('slips_threshold')}</span>
          <input type="number" min="0" step="100" inputmode="numeric" bind:value={$slipsThreshold} />
          <span>฿</span>
        </label>

        {#if under.length > 0}
          <p class="ws-sharing-none">
            {$t('slips_under', {
              values: {
                count: under.length,
                amount: money(threshold),
                total: money(
                  under.reduce((sum, slip) => sum + (slip.amount ?? 0), 0),
                  true,
                ),
              },
            })}
          </p>
          <div class="ws-slips-grid">
            {#each under as slip (slip.id)}
              {@render tile(slip, !kept.has(slip.id), () => toggle(kept, slip.id))}
            {/each}
          </div>
        {:else}
          <p class="ws-sharing-none">{$t('slips_none_under', { values: { amount: money(threshold) } })}</p>
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

        <p class="ws-inbox-meta ws-slips-stay">
          {$t('slips_stay', { values: { over, none, amount: money(threshold) } })}
        </p>

        <div class="ws-empty-actions">
          <button
            type="button"
            class="ws-empty-action ws-slips-trash"
            disabled={going.length === 0 || trashing}
            onclick={trash}
          >
            {$t('slips_trash', { values: { count: going.length } })}
          </button>
          {#if trashing}<LoadingSpinner />{/if}
        </div>
      </section>
    {/if}
  </div>
</UserPageLayout>

{#if peek}
  <div class="ws-slip-peek" aria-hidden="true"><img src={preview(peek)} alt="" /></div>
{/if}

<style>
  .ws-slips-loading {
    display: flex;
    justify-content: center;
    padding: 4rem 0;
  }
  .ws-slips-threshold {
    display: inline-flex;
    align-items: center;
    gap: 0.6rem;
    margin-bottom: calc(var(--ws-gap) * 1.2);
    font-size: var(--ws-text-ui);
    font-weight: 600;
  }
  .ws-slips-threshold input {
    width: 8rem;
    padding: 0.35rem 0.6rem;
    border: 1px solid var(--ws-hairline);
    border-radius: var(--ws-radius);
    background: transparent;
    font-family: var(--ws-font-data);
    font-variant-numeric: tabular-nums;
  }
  .ws-slips-threshold input:focus-visible {
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
  /* a slip that stays (kept, or not added) steps back; the ones going keep their colour */
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
  .ws-slips-trash {
    background: var(--immich-ui-danger, #c62828);
  }
  .ws-slips-trash:hover {
    background: color-mix(in oklab, var(--immich-ui-danger, #c62828) 85%, black);
  }
  .ws-slips-trash:disabled,
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
