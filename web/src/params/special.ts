import type { ParamMatcher } from '@sveltejs/kit';
import { specialAlbums } from '$lib/managers/special-albums.svelte';

/* Local Omarchy layer: the special albums' own pages, /todo and /villa (managers/special-albums) */
export const match: ParamMatcher = (param: string) => specialAlbums.some(({ slug }) => slug === param);
