import { getAssetMediaUrl, getAssetPlaybackUrl } from '#lib/utils.ts';
import { curatorLyrics, musicUrl } from '#lib/utils/curator.ts';
import { getAltText } from '#lib/utils/thumbnail-util.ts';
import { toTimelineAsset } from '#lib/utils/timeline-util.ts';
import { AssetMediaSize } from '@immich/sdk';
import { get } from 'svelte/store';
import type { FilmMedia } from './film-media';

export const privateFilmMedia: FilmMedia = {
  preview: (id, cacheKey) => getAssetMediaUrl({ id, size: AssetMediaSize.Preview, cacheKey }),
  thumbnail: (id, cacheKey) => getAssetMediaUrl({ id, cacheKey }),
  video: (id, cacheKey) => getAssetPlaybackUrl({ id, cacheKey }),
  music: musicUrl,
  lyrics: curatorLyrics,
  alt: (asset) => get(getAltText)(toTimelineAsset(asset)),
};
