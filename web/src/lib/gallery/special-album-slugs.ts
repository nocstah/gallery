/**
Local Omarchy layer: the special albums' page addresses (/todo, /villa, /qr), kept apart from their manager
(managers/special-albums) so the route matcher in src/params.ts, which SvelteKit also loads on the server, doesn't
pull in browser-only code. Each special album takes its slug from this list.
*/
export const SPECIAL_ALBUM_SLUGS = ['todo', 'villa', 'qr'] as const;

export type SpecialAlbumSlug = (typeof SPECIAL_ALBUM_SLUGS)[number];

export const isSpecialAlbumSlug = (param: string): param is SpecialAlbumSlug =>
  (SPECIAL_ALBUM_SLUGS as readonly string[]).includes(param);
