import {
  type AssetResponseDto,
  BulkIdErrorReason,
  MemorySearchOrder,
  MemoryType,
  addMemoryAssets,
  createMemory,
  deleteMemory,
  type BulkIdResponseDto,
  type MemoryResponseDto,
  getMemory,
  removeMemoryAssets,
  searchMemories,
  updateMemory,
  memoriesStatistics,
} from '@immich/sdk';
import { toastManager } from '@immich/ui';
import { isEqual, omitBy } from 'lodash-es';
import { DateTime } from 'luxon';
import { t } from 'svelte-i18n';
import { SvelteMap } from 'svelte/reactivity';
import { fromStore, get } from 'svelte/store';
import { goto } from '$app/navigation';
import { page } from '$app/state';
import { QueryParameter } from '$lib/constants';
import { authManager } from '$lib/managers/auth-manager.svelte';
import { eventManager } from '$lib/managers/event-manager.svelte';
import { memoryFacts } from '$lib/managers/memory-facts.svelte';
import type { TimelineAsset } from '$lib/managers/timeline-manager/types';
import { undoManager } from '$lib/managers/undo-manager.svelte';
import { userPreferencesManager } from '$lib/managers/user-preferences-manager.svelte';
import { Route } from '$lib/route';
import { memoryLaneTitle } from '$lib/utils';
import { handleError } from '$lib/utils/handle-error';
import { cardOfMemory, memoryCards, wallClockAsUtc, type MemoryCard } from '$lib/utils/memory-cards';
import { memoryCount, memoryTitle } from '$lib/utils/memory-title';
import { toTimelineAsset } from '$lib/utils/timeline-util';
import { toastUndoable, UNDO_TOAST_MS, undone } from '$lib/utils/undoable';

type MemoriesSearchDto = Parameters<typeof searchMemories>[0];

/** Local Omarchy layer: a memory taken off the page, as it was, with the memory that came after it (its place). */
type Kept = { memory: MemoryResponseDto; before?: string };

/**
 * Local Omarchy layer: what Remove memory took off the page, or Remove photo emptied (DESIGN.md, Memories: the film's
 * ⋮). Gallery deletes it only once its toast has had its time, or at once when the page goes away, so the toast's
 * Undo puts each memory back exactly as it was (its id, and with it Curator's story and songs, which go by the id);
 * an Undo after that makes each again from what it held (a new id).
 */
type Removal = {
  kept: Kept[];
  timer?: ReturnType<typeof setTimeout>;
  /** the deletion, once it has gone to Gallery: resolves with the ids it deleted */
  deletion?: Promise<Set<string>>;
  /** the memories an Undo has made again, by the id each had, so an Undo tried again after a failure goes on */
  made: Map<string, MemoryResponseDto>;
};

/** a photo Remove photo took out of a memory at once, and the photo that came after it there (its place) */
type Taken = { memoryId: string; asset: AssetResponseDto; before?: string; back?: boolean };

/** Gallery's answer for a photo of a bulk call when it was not done (nor, with `already`, done before): its reason */
const refused = (results: BulkIdResponseDto[], id: string, already?: BulkIdErrorReason) => {
  const result = results.find((candidate) => candidate.id === id && !candidate.success);
  return result && result.error !== already ? new Error(result.errorMessage ?? result.error) : undefined;
};

// Local Omarchy layer: a removal is deleted from Gallery a little after its toast has gone, so a press on Undo as the
// toast leaves still finds it held
const HOLD_MS = UNDO_TOAST_MS + 500;

type AdjacentMemory = {
  href: string;
  assetId: string;
  title: string;
};

/** Everything the memory viewer renders, for the position currently in the url. */
export type MemoryState = {
  /** Local Omarchy layer: the url's memory, holding the photos of every memory on its card (utils/memory-cards) when
   * several read the same, so the film plays them as one */
  memory: MemoryResponseDto;
  /** Local Omarchy layer: the card the url's memory is shown on, with the memories it holds */
  card: MemoryCard;
  asset: TimelineAsset;
  /** The assets the asset viewer can navigate through, spanning the adjacent memories. */
  viewerAssets: AssetResponseDto[];
  previousMemory?: AdjacentMemory;
  nextMemory?: AdjacentMemory;
  previousHref?: string;
  nextHref?: string;
  getAssetHref: (assetId: string) => string | undefined;
};

class MemoryManager {
  #loading = $state<Promise<void>>();
  #filters = $state<MemoriesSearchDto>({ size: 250, order: MemorySearchOrder.Desc });
  #hasNextPage: boolean = true;
  #page: number = 1;
  #total: number | undefined = $state();
  #queued: boolean = false;
  // Local Omarchy layer: the removals still held from Gallery, and the ids of the memories they hold, which a page
  // loaded meanwhile leaves out
  #removals = new Set<Removal>();
  #held = new Set<string>();

  constructor() {
    eventManager.on({
      // a removal still held is let go, its memories left in Gallery: signed out, nothing can delete them any more
      AuthLogout: () => {
        this.#letGo();
        this.clearCache();
      },
      AuthUserLoaded: () => this.initialize(),
    });

    // loaded event might have already happened
    if (authManager.authenticated) {
      void this.initialize();
    }

    this.scheduleHourlyRefresh();

    // Local Omarchy layer: a page going away (closed, reloaded, put in the background on a phone) deletes at once what
    // its toasts still hold, the requests sent as it goes (keepalive), so a memory removed is never left in Gallery
    if (typeof window !== 'undefined') {
      window.addEventListener('pagehide', () => this.#commitAll());
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') {
          this.#commitAll();
        }
      });
    }
  }

  get filters() {
    return this.#filters;
  }

  setFilters(filters: MemoriesSearchDto) {
    filters = omitBy(filters, (item) => item === undefined);
    if (!isEqual(this.#filters, filters)) {
      this.#filters = filters;
      this.clearCache();
      void this.loadNextPage();
    }
  }

  refresh() {
    return this.initialize();
  }

  async refreshMemory(id: string) {
    const updated = await getMemory({ id });
    this.memories = this.memories.map((memory) => (memory.id === id ? updated : memory));
    memoryFacts.refresh(id);
    return updated;
  }

  applyPreferences() {
    const { showUpcoming, onlyFavorites } = userPreferencesManager.memories;
    this.setFilters({
      order: MemorySearchOrder.Desc,
      isSaved: onlyFavorites ? true : undefined,
      isUpcoming: showUpcoming ? undefined : false,
    });

    return this.refresh();
  }

  memories = $state<MemoryResponseDto[]>([]);

  #memoryLaneTitle = fromStore(memoryLaneTitle);

  #url = $derived({
    memoryId: page.params.id,
    assetId: page.url.searchParams.get(QueryParameter.ASSET_ID) ?? undefined,
    isSaved: page.url.searchParams.get(QueryParameter.IS_SAVED) === 'true' || undefined,
  });

  memoriesHref = $derived(Route.memories({ isSaved: this.#url.isSaved }));

  // Local Omarchy layer: the cards the memories are shown as (utils/memory-cards, DESIGN.md Memories): memories that
  // read the same (one place and month, by the title of facts, utils/memory-title) are one card, today's first in the
  // one order Room plays them in too (room-source), then the earlier days', then the upcoming ones. The Memories page
  // and Explore show them, and the film plays a card's photos as one, steps to the card before or after it and acts on
  // all its memories (the heart, Remove memory, Remove photo). The key is titled in one locale, so it does not move
  // with the reader's; Curator's count of a memory weighs which of one kind leads its card, and its span tells a memory
  // of several days.
  cards = $derived(
    memoryCards(
      this.memories,
      (memory) => memoryTitle(memory, memoryFacts.get(memory.id), 'en-US')?.title,
      wallClockAsUtc(),
      (memory) => memoryCount(memory, memoryFacts.get(memory.id)),
      (memory) => memoryFacts.get(memory.id),
    ),
  );

  /** Local Omarchy layer: the card a memory is shown on (by any of its memories' ids). */
  cardOf(memoryId: string): MemoryCard | undefined {
    return cardOfMemory(this.cards, memoryId);
  }

  #lookup = $derived.by(() => {
    const lookup = new SvelteMap<string, { memoryIndex: number; assetIndexes: Map<string, number> }>();

    for (const [memoryIndex, memory] of this.memories.entries()) {
      const assetIndexes = new Map(memory.assets.map((asset, assetIndex) => [asset.id, assetIndex] as const));
      lookup.set(memory.id, { memoryIndex, assetIndexes });
    }

    return lookup;
  });

  current = $derived.by((): MemoryState | undefined => {
    const { memoryId, assetId } = this.#url;
    if (memoryId === undefined || assetId === undefined) {
      return;
    }

    const location = this.#lookup.get(memoryId);
    if (!location) {
      return;
    }

    // Local Omarchy layer: the url's memory on its card, which may hold others that read the same: the film plays
    // their photos as one, and steps to the cards next to it
    const cards = this.cards;
    const cardIndex = cards.findIndex(({ members }) => members.some(({ id }) => id === memoryId));
    const card = cards[cardIndex];
    if (!card) {
      return;
    }

    const own = this.memories[location.memoryIndex];
    const memory = card.members.length > 1 ? { ...own, assets: card.assets, isSaved: card.isSaved } : own;
    const assetIndex = memory.assets.findIndex(({ id }) => id === assetId);
    if (assetIndex === -1) {
      return;
    }

    const previousCard = cards[cardIndex - 1];
    const nextCard = cards[cardIndex + 1];

    return {
      memory,
      card,
      asset: toTimelineAsset(memory.assets[assetIndex]),
      viewerAssets: [...(previousCard?.assets ?? []), ...memory.assets, ...(nextCard?.assets ?? [])],
      previousMemory: this.#toAdjacentMemory(previousCard),
      nextMemory: this.#toAdjacentMemory(nextCard),
      previousHref:
        assetIndex > 0
          ? this.#toHref(memory, memory.assets[assetIndex - 1])
          : this.#toHref(previousCard?.lead, previousCard?.assets.at(-1)),
      nextHref:
        assetIndex < memory.assets.length - 1
          ? this.#toHref(memory, memory.assets[assetIndex + 1])
          : this.#toHref(nextCard?.lead, nextCard?.assets[0]),
      getAssetHref: (assetId: string) => this.#toHref(memory, { id: assetId }),
    };
  });

  #toHref(memory: { id: string } | undefined, asset: { id: string } | undefined) {
    return memory && asset
      ? Route.viewMemory({ id: memory.id, assetId: asset.id, isSaved: this.#url.isSaved })
      : undefined;
  }

  #toAdjacentMemory(card: MemoryCard | undefined): AdjacentMemory | undefined {
    if (!card) {
      return;
    }

    const asset = card.assets[0];
    const href = this.#toHref(card.lead, asset);
    if (!href) {
      return;
    }

    return { href, assetId: asset.id, title: this.#memoryLaneTitle.current(card.lead) };
  }

  // the memory holding an asset, checking the given memory first, then the ones next to it. Local Omarchy layer: by
  // cards, so a photo of another memory on the same card is the given memory's own (its film plays it)
  getMemoryWithAsset(assetId: string, memoryId: string) {
    if (!this.#lookup.has(memoryId)) {
      return;
    }

    const cards = this.cards;
    const index = cards.findIndex(({ members }) => members.some(({ id }) => id === memoryId));
    if (index === -1) {
      return;
    }

    const holds = (card: MemoryCard | undefined) => !!card?.assets.some(({ id }) => id === assetId);
    if (holds(cards[index])) {
      return this.#getMemory(memoryId);
    }
    return [cards[index - 1], cards[index + 1]].find((card) => holds(card))?.lead;
  }

  #getMemory(id: string) {
    const location = this.#lookup.get(id);
    return location ? this.memories[location.memoryIndex] : undefined;
  }

  /** Fetch a memory that is not part of the loaded pages, i.e. when opening a link to an older one. */
  async loadMemory(id: string) {
    const memory = this.#getMemory(id);
    if (memory || this.#held.has(id)) {
      return memory;
    }

    const [loaded] = await searchMemories({ id }).catch(() => []);
    if (!loaded) {
      return;
    }

    // memories are ordered by date, descending
    const index = this.memories.findIndex(({ memoryAt }) => memoryAt < loaded.memoryAt);
    this.memories.splice(index === -1 ? this.memories.length : index, 0, loaded);

    return loaded;
  }

  async hideAssets(ids: string[]) {
    if (this.current && ids.includes(this.current.asset.id)) {
      await this.#leaveCurrentAsset();
    }

    const idSet = new Set<string>(ids);
    for (const memory of this.memories) {
      memory.assets = memory.assets.filter((asset) => !idSet.has(asset.id));
    }
    // if we removed all assets from a memory, then lets remove those memories (we don't show memories with 0 assets)
    this.memories = this.memories.filter((memory) => memory.assets.length > 0);
  }

  /** Local Omarchy layer: whether the account may remove the card's memories (with `assetId`, that photo from them):
   * Gallery lets only a memory's owner change it, and the lane also shows memories others share with them. */
  removable(card: MemoryCard, assetId?: string) {
    return card.members.some(
      (memory) => this.#mine(memory) && (assetId === undefined || memory.assets.some(({ id }) => id === assetId)),
    );
  }

  // Local Omarchy layer: the photo leaves every memory of the card that holds it (the account's own), since the film
  // plays them as one. From a memory with other photos it is taken out at once, and the Undo (its toast's, the bar's,
  // Ctrl+Z) adds it back in its place; a memory it was the last photo of goes as Remove memory's do, held until the
  // toast has gone. `title` names the memory in the toast and the bar's history.
  async deleteCurrentAsset(title?: string) {
    const current = this.current;
    if (!current) {
      return;
    }

    const translate = get(t);
    const memoryId = current.memory.id;
    const assetId = current.asset.id;
    const holders = current.card.members.filter(
      (memory) => this.#mine(memory) && memory.assets.some(({ id }) => id === assetId),
    );
    if (holders.length === 0) {
      return;
    }
    await this.#leaveCurrentAsset();
    const left = this.#here();

    const taken: Taken[] = [];
    let failure: unknown;
    for (const memory of holders) {
      if (memory.assets.length === 1) {
        continue;
      }
      const index = memory.assets.findIndex(({ id }) => id === assetId);
      const asset = $state.snapshot(memory.assets[index]) as AssetResponseDto;
      const before = memory.assets[index + 1]?.id;
      try {
        const no = refused(await removeMemoryAssets({ id: memory.id, bulkIdsDto: { ids: [assetId] } }), assetId);
        if (no) {
          throw no;
        }
        memory.assets = memory.assets.filter(({ id }) => id !== assetId);
        taken.push({ memoryId: memory.id, asset, before });
      } catch (error) {
        failure = error;
      }
    }
    const emptied = holders.filter(({ assets }) => assets.length === 1);
    const removal = emptied.length > 0 ? this.#hold(emptied) : undefined;
    if (failure !== undefined) {
      handleError(failure, translate('errors.unable_to_remove_photo_from_memory'));
    }
    if (taken.length === 0 && !removal) {
      return;
    }

    const label = title
      ? translate('memory_photo_removed_titled', { values: { title } })
      : translate('memory_photo_removed');
    const entry = undoManager.record(
      label,
      async () => {
        for (const item of taken) {
          if (item.back) {
            continue;
          }
          const results = await addMemoryAssets({ id: item.memoryId, bulkIdsDto: { ids: [assetId] } });
          const no = refused(results, assetId, BulkIdErrorReason.Duplicate);
          if (no) {
            throw no;
          }
          item.back = true;
          this.#putPhotoBack(item);
        }
        const missing = removal ? await this.#undoRemoval(removal) : 0;
        await this.#returnTo(left, memoryId, assetId, removal);
        return this.#undone(label, missing);
      },
      translate('errors.unable_to_restore_memory'),
    );
    toastUndoable(label, entry);
  }

  // Local Omarchy layer: a card is one memory to its reader, so Remove memory removes every memory it holds (the
  // account's own). They leave the page at once and Gallery deletes them once the toast has gone (Removal); the Undo
  // (its toast's, the bar's, Ctrl+Z) puts them back, and the film goes back to the photo it was on while nothing has
  // moved since. `title` names the memory in the toast and the bar's history.
  async deleteCurrentMemory(title?: string) {
    const current = this.current;
    if (!current) {
      return;
    }

    const translate = get(t);
    const members = current.card.members.filter((memory) => this.#mine(memory));
    if (members.length === 0) {
      return;
    }
    const memoryId = current.memory.id;
    const assetId = current.asset.id;
    await this.#goto(current.nextMemory?.href ?? current.previousMemory?.href ?? this.memoriesHref);
    const left = this.#here();
    const removal = this.#hold(members);

    const label = title ? translate('memory_removed_titled', { values: { title } }) : translate('removed_memory');
    const entry = undoManager.record(
      label,
      async () => {
        const missing = await this.#undoRemoval(removal);
        await this.#returnTo(left, memoryId, assetId, removal);
        return this.#undone(label, missing);
      },
      translate('errors.unable_to_restore_memory'),
    );
    toastUndoable(label, entry);
  }

  // Local Omarchy layer: the heart keeps, or lets go of, every memory on the card
  async toggleCurrentMemorySaved() {
    const current = this.current;
    if (!current) {
      return;
    }

    const isSaved = !current.card.isSaved;
    const members = current.card.members;
    await Promise.all(members.map(({ id }) => updateMemory({ id, memoryUpdateDto: { isSaved } })));
    for (const member of members) {
      member.isSaved = isSaved;
    }
    toastManager.primary(get(t)(isSaved ? 'added_to_favorites' : 'removed_from_favorites'));
  }

  // navigate away before removing something, so the url never points at a deleted position
  #leaveCurrentAsset() {
    const { nextHref, previousHref } = this.current ?? {};
    return this.#goto(nextHref ?? previousHref ?? this.memoriesHref);
  }

  #goto(href: string) {
    return goto(href, { replaceState: true, noScroll: true, keepFocus: true });
  }

  // ---- Local Omarchy layer: removals held from Gallery while their toast offers Undo (Removal) ----

  #mine(memory: MemoryResponseDto) {
    return authManager.authenticated && memory.ownerId === authManager.user.id;
  }

  /** the address the page is at */
  #here() {
    return `${page.url.pathname}${page.url.search}`;
  }

  /** Takes memories off the page at once; Gallery deletes them once their toast has had its time. */
  #hold(memories: MemoryResponseDto[]): Removal {
    const ids = new Set(memories.map(({ id }) => id));
    const kept: Kept[] = [];
    for (const [index, memory] of this.memories.entries()) {
      if (ids.has(memory.id)) {
        kept.push({ memory: $state.snapshot(memory) as MemoryResponseDto, before: this.memories[index + 1]?.id });
      }
    }
    this.memories = this.memories.filter(({ id }) => !ids.has(id));
    for (const id of ids) {
      this.#held.add(id);
    }
    const removal: Removal = { kept, made: new Map() };
    removal.timer = setTimeout(() => void this.#commit(removal), HOLD_MS);
    this.#removals.add(removal);
    return removal;
  }

  /** Deletes a removal's memories from Gallery, once: its timer, a page going away and an Undo wait on the same. */
  #commit(removal: Removal, keepalive = false): Promise<Set<string>> {
    if (!removal.deletion) {
      clearTimeout(removal.timer);
      this.#removals.delete(removal);
      // every request goes out before the first answer, so a page going away sends them all
      const requests = removal.kept.map(({ memory }) =>
        deleteMemory({ id: memory.id }, keepalive ? { keepalive } : undefined),
      );
      removal.deletion = this.#settle(removal, requests);
    }
    return removal.deletion;
  }

  #commitAll() {
    for (const removal of this.#removals) {
      void this.#commit(removal, true);
    }
  }

  /** Signed out: what is still held stays in Gallery, and its Undo has nothing to take back. */
  #letGo() {
    for (const removal of this.#removals) {
      clearTimeout(removal.timer);
      removal.deletion = Promise.resolve(new Set());
    }
    this.#removals.clear();
    this.#held.clear();
  }

  async #settle(removal: Removal, requests: Promise<unknown>[]) {
    const results = await Promise.allSettled(requests);
    // eslint-disable-next-line svelte/prefer-svelte-reactivity -- an answer, not state the page reads
    const deleted = new Set<string>();
    const left: Kept[] = [];
    let failure: unknown;
    for (const [index, result] of results.entries()) {
      const item = removal.kept[index];
      this.#held.delete(item.memory.id);
      if (result.status === 'fulfilled') {
        deleted.add(item.memory.id);
      } else {
        failure = result.reason;
        left.push(item);
      }
    }
    if (left.length > 0) {
      // still in Gallery: back on the page, and said
      this.#putBack(left);
      handleError(failure, get(t)('errors.unable_to_remove_memory'));
    }
    return deleted;
  }

  /**
   * Puts a removal's memories back: as they were while Gallery still holds them; once deleted, each is made again from
   * what it held (its kind, its rule's data, its dates, its heart and its photos, under a new id). Resolves with how
   * many photos Gallery did not take back in.
   */
  async #undoRemoval(removal: Removal): Promise<number> {
    if (!removal.deletion) {
      clearTimeout(removal.timer);
      this.#removals.delete(removal);
      this.#putBack(removal.kept);
      return 0;
    }
    const deleted = await removal.deletion;
    let missing = 0;
    // the last first, so each one's place (the memory after it) is back before it
    for (const { memory, before } of [...removal.kept].reverse()) {
      if (!deleted.has(memory.id) || removal.made.has(memory.id)) {
        continue;
      }
      const made = await createMemory({
        memoryCreateDto: {
          type: memory.type,
          data: memory.data,
          memoryAt: memory.memoryAt,
          showAt: memory.showAt,
          hideAt: memory.hideAt,
          seenAt: memory.seenAt,
          isSaved: memory.isSaved,
          assetIds: memory.assets.map(({ id }) => id),
        },
      });
      removal.made.set(memory.id, made);
      missing += Math.max(0, memory.assets.length - made.assets.length);
      this.#putBack([{ memory: made, before: (before && removal.made.get(before)?.id) || before }]);
    }
    return missing;
  }

  /** Memories back in the list where they were: before the memory that came after each, else by date. */
  #putBack(items: Kept[]) {
    const memories = [...this.memories];
    for (const { memory, before } of [...items].reverse()) {
      this.#held.delete(memory.id);
      if (memories.some(({ id }) => id === memory.id)) {
        continue;
      }
      let index = before ? memories.findIndex(({ id }) => id === before) : -1;
      if (index === -1) {
        // memories are ordered by date, descending
        index = memories.findIndex(({ memoryAt }) => memoryAt < memory.memoryAt);
      }
      memories.splice(index === -1 ? memories.length : index, 0, memory);
    }
    this.memories = memories;
  }

  /** A photo back in a memory where it was: before the photo that came after it, else by when it was taken. */
  #putPhotoBack({ memoryId, asset, before }: Taken) {
    const memory = this.#getMemory(memoryId);
    if (!memory || memory.assets.some(({ id }) => id === asset.id)) {
      return;
    }
    const assets = [...memory.assets];
    let index = before ? assets.findIndex(({ id }) => id === before) : -1;
    if (index === -1) {
      // Gallery orders a memory's photos by when they were taken
      index = assets.findIndex(({ localDateTime }) => localDateTime > asset.localDateTime);
    }
    assets.splice(index === -1 ? assets.length : index, 0, asset);
    memory.assets = assets;
  }

  /** After an Undo, the film goes back to the photo it was on, while the page is where the removal left it. */
  async #returnTo(left: string, memoryId: string, assetId: string, removal?: Removal) {
    const id = removal?.made.get(memoryId)?.id ?? memoryId;
    if (this.#here() === left && this.#getMemory(id)) {
      await this.#goto(Route.viewMemory({ id, assetId, isSaved: this.#url.isSaved }));
    }
  }

  #undone(label: string, missing: number) {
    const words = undone(label);
    return missing > 0 ? `${words}. ${get(t)('memory_photos_not_restored', { values: { count: missing } })}` : words;
  }

  loadNextPage() {
    if (this.#hasNextPage) {
      if (this.#loading === undefined) {
        this.#loading = this.load(this.#page++);
      } else {
        this.#queued = true;
      }
    }
  }

  get hasNextPage() {
    return this.#hasNextPage;
  }

  get total() {
    return this.#total;
  }

  get loading() {
    return this.#loading;
  }

  private clearCache() {
    this.#hasNextPage = true;
    this.#page = 1;
    this.#total = undefined;
    this.memories = [];
  }

  private initialize() {
    if (!this.#loading) {
      this.#loading = this.load(this.#page++);
    }

    return this.#loading;
  }

  private async load(page: number) {
    const items = await searchMemories({ ...this.#filters, page });

    if (this.#queued) {
      this.#queued = false;
      this.#loading = this.load(this.#page++);
      await this.#loading;
      return;
    }

    for (const item of items) {
      // Local Omarchy layer: nor one a removal still holds from Gallery (it is gone from the page)
      if (!this.#lookup.has(item.id) && !this.#held.has(item.id)) {
        this.memories.push(item);
      }
    }

    if (this.#filters.$for) {
      this.memories.sort((a, b) => Number(b.type === MemoryType.Birthday) - Number(a.type === MemoryType.Birthday));
    }

    if (this.#total === undefined) {
      const { total } = await memoriesStatistics(this.#filters);
      this.#total = total;
    }

    this.#hasNextPage = this.memories.length < this.#total;
    this.#loading = undefined;
  }

  private scheduleHourlyRefresh() {
    const now = DateTime.utc();
    let nextEvent = now.set({ minute: 0, second: 5 });

    if (nextEvent <= now) {
      nextEvent = nextEvent.plus({ hours: 1 });
    }

    const initialDelay = nextEvent.diff(now).as('milliseconds');

    setTimeout(() => {
      if (this.#page <= 2) {
        this.clearCache();
        this.loadNextPage();
      }

      // Schedule subsequent events hourly
      setInterval(
        () => {
          if (this.#page > 2) {
            return;
          }
          this.clearCache();
          this.loadNextPage();
        },
        60 * 60 * 1000,
      );
    }, initialDelay);
  }
}

export const memoryManager = new MemoryManager();
