import type { AssetResponseDto } from '@immich/sdk';
import type { LyricLine } from './film-lyrics';

/** The player owns presentation; its host supplies either private or share-scoped media. */
export type FilmMedia = {
  preview: (id: string, thumbhash?: string | null) => string;
  thumbnail: (id: string, thumbhash?: string | null) => string;
  video: (id: string, thumbhash?: string | null) => string;
  music: (src: string) => string;
  /** a song's timed lyrics, for a host whose songs do not bring their own */
  lyrics?: (trackId: string) => Promise<LyricLine[]>;
  alt: (asset: AssetResponseDto) => string;
};

export const decodeThumbhash = (data: string) => Uint8Array.from(atob(data), (character) => character.codePointAt(0)!);
