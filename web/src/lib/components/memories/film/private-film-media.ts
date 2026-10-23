import { AssetMediaSize } from '@immich/sdk';
import { get } from 'svelte/store';
import { getAssetMediaUrl, getAssetPlaybackUrl } from '$lib/utils';
import { musicUrl } from '$lib/utils/curator';
import { getAltText } from '$lib/utils/thumbnail-util';
import { toTimelineAsset } from '$lib/utils/timeline-util';
import type { FilmMedia } from './film-media';

export const privateFilmMedia: FilmMedia = {
  preview: (id, cacheKey) => getAssetMediaUrl({ id, size: AssetMediaSize.Preview, cacheKey }),
  thumbnail: (id, cacheKey) => getAssetMediaUrl({ id, cacheKey }),
  video: (id, cacheKey) => getAssetPlaybackUrl({ id, cacheKey }),
  music: musicUrl,
  alt: (asset) => get(getAltText)(toTimelineAsset(asset)),
};
