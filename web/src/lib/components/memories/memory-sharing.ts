import type { FilmStoryCue } from './film/film-plan';

/** Only the presentation the owner is sharing; no private asset metadata or session credentials. */
export type MemoryPresentation = {
  assetIds: string[];
  name: string;
  title: string;
  line: string;
  cover: string | null;
  focus: Record<string, [number, number]>;
  story: string | null;
  storyCues: FilmStoryCue[];
  trackIds: string[];
  photoSeconds: number;
  language: string;
};

export type MemoryShareMode = 'memory' | 'portrait' | 'landscape';
export const memoryVideoAspect = (mode: Exclude<MemoryShareMode, 'memory'>) => (mode === 'portrait' ? 9 / 16 : 16 / 9);
