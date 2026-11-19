import { vaultMapConfig } from '#lib/gallery/edition.ts';
import { getPublicConfig } from '@immich/sdk';
import { queryOptions } from '@tanstack/svelte-query';

export const getPublicConfigQuery = () =>
  queryOptions({
    queryKey: ['config', 'public'],
    // Local Omarchy layer: a vault's Gallery draws no map, and asks no tile server anything (gallery/edition)
    queryFn: async ({ signal }) => vaultMapConfig(await getPublicConfig({ signal })),
    gcTime: Infinity,
  });
