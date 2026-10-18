import { redirect } from '@sveltejs/kit';
import { QueryParameter, UUID_REGEX } from '$lib/constants';
import { memoryFacts } from '$lib/managers/memory-facts.svelte';
import { memoryManager } from '$lib/managers/memory-manager.svelte';
import { Route } from '$lib/route';
import { authenticate } from '$lib/utils/auth';
import { getFormatter } from '$lib/utils/i18n';
import type { PageLoad } from './$types';

export const load = (async ({ url, params }) => {
  await authenticate(url);
  const $t = await getFormatter();

  if (!UUID_REGEX.test(params.id)) {
    redirect(307, Route.memories());
  }

  await memoryManager.loading;

  const memory = await memoryManager.loadMemory(params.id);
  if (!memory) {
    redirect(307, memoryManager.memoriesHref);
  }

  // Local Omarchy layer: memories that read the same are one card and play as one film (utils/memory-cards). What
  // titles them is Curator's facts, so they are waited for (a moment at most, memoryFacts) before the photo in the
  // address is checked against the card's photos
  await memoryFacts.settle(memoryManager.memories.map(({ id }) => id));

  if (params.assetId) {
    const targetMemory = memoryManager.getMemoryWithAsset(params.assetId, memory.id);
    if (targetMemory && targetMemory.id !== memory.id) {
      redirect(307, Route.viewMemoryAsset({ id: targetMemory.id, assetId: params.assetId }));
    }
  }

  const photos = memoryManager.cardOf(memory.id)?.assets ?? memory.assets;
  const assetIds = new Set(photos.map((asset) => asset.id));
  const assetId =
    [params.assetId, url.searchParams.get(QueryParameter.ASSET_ID)].find((id) => id && assetIds.has(id)) ??
    photos[0]?.id;

  if (!assetId) {
    redirect(307, memoryManager.memoriesHref);
  }

  if (url.searchParams.get(QueryParameter.ASSET_ID) !== assetId) {
    const target = new URL(url);
    target.searchParams.set(QueryParameter.ASSET_ID, assetId);
    redirect(307, target.pathname + target.search);
  }

  return {
    meta: {
      title: $t('memory'),
    },
  };
}) satisfies PageLoad;
