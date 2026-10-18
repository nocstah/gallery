import {
  type AssetResponseDto,
  MemorySearchOrder,
  MemoryType,
  deleteMemory,
  type MemoryResponseDto,
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
import { userPreferencesManager } from '$lib/managers/user-preferences-manager.svelte';
import { Route } from '$lib/route';
import { memoryLaneTitle } from '$lib/utils';
import { cardOfMemory, memoryCards, wallClockAsUtc, type MemoryCard } from '$lib/utils/memory-cards';
import { memoryCount, memoryTitle } from '$lib/utils/memory-title';
import { toTimelineAsset } from '$lib/utils/timeline-util';

type MemoriesSearchDto = Parameters<typeof searchMemories>[0];

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

  constructor() {
    eventManager.on({
      AuthLogout: () => this.clearCache(),
      AuthUserLoaded: () => this.initialize(),
    });

    // loaded event might have already happened
    if (authManager.authenticated) {
      void this.initialize();
    }

    this.scheduleHourlyRefresh();
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
  // read the same (one place and month, by the title of facts, utils/memory-title) are one card, today's first, then
  // the earlier days', then the upcoming ones. The Memories page and Explore show them, and the film plays a card's
  // photos as one, steps to the card before or after it and acts on all its memories (the heart, Remove memory,
  // Remove photo). The key is titled in one locale, so it does not move with the reader's; Curator's count of a
  // memory weighs which of one kind leads its card.
  cards = $derived(
    memoryCards(
      this.memories,
      (memory) => memoryTitle(memory, memoryFacts.get(memory.id), 'en-US')?.title,
      wallClockAsUtc(),
      (memory) => memoryCount(memory, memoryFacts.get(memory.id)),
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
    if (memory) {
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

  // Local Omarchy layer: the photo leaves every memory of the card that holds it, since the film plays them as one
  async deleteCurrentAsset() {
    const current = this.current;
    if (!current) {
      return;
    }

    const assetId = current.asset.id;
    const holders = current.card.members
      .filter(({ assets }) => assets.some(({ id }) => id === assetId))
      .map(({ id }) => id);
    await this.#leaveCurrentAsset();
    for (const memoryId of holders) {
      await this.#deleteAsset(memoryId, assetId);
    }
  }

  // Local Omarchy layer: a card is one memory to its reader, so Remove memory removes every memory it holds
  async deleteCurrentMemory() {
    const current = this.current;
    if (!current) {
      return;
    }

    const ids = current.card.members.map(({ id }) => id);
    await this.#goto(current.nextMemory?.href ?? current.previousMemory?.href ?? this.memoriesHref);
    for (const id of ids) {
      await this.#deleteMemory(id);
    }
    toastManager.primary(get(t)('removed_memory'));
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

  async #deleteMemory(id: string) {
    if (!this.#getMemory(id)) {
      return;
    }

    await deleteMemory({ id });
    this.memories = this.memories.filter((memory) => memory.id !== id);
  }

  async #deleteAsset(memoryId: string, assetId: string) {
    const memory = this.#getMemory(memoryId);
    if (!memory?.assets.some((asset) => asset.id === assetId)) {
      return;
    }

    if (memory.assets.length === 1) {
      await this.#deleteMemory(memoryId);
      return;
    }

    await removeMemoryAssets({ id: memoryId, bulkIdsDto: { ids: [assetId] } });
    memory.assets = memory.assets.filter((asset) => asset.id !== assetId);
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
      if (!this.#lookup.has(item.id)) {
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
