import { curatorOffers } from '$lib/gallery/libraries/library-context.svelte';
import { curatorIsMine } from '$lib/utils/curator';

// Local Omarchy layer: where "From the beginning" lives, and who has it (gallery/series). It is one of the owner's tools
// ("Owner tools only for me"): Curator's owner, in a library whose Curator offers what it adds to memories. A vault's
// Gallery and a library without such a Curator leave the page out (gallery/edition, gallery/libraries). The page lists
// the owner's series; each series has a page of its own under it, by Curator's id.

export const SERIES_ROUTE = '/from-the-beginning';

/** One series' own page: its Coming up, its family page and its leave-out list. */
export const seriesRoute = (id: number) => `${SERIES_ROUTE}/${id}`;

/** The series id a page's address names, or null where it names none Curator could have (it keeps them as numbers
 * from 1). */
export const seriesIdOf = (param: string): number | null => (/^[1-9]\d{0,14}$/.test(param) ? Number(param) : null);

/** Whether whoever is signed in has the page: read in a template, it follows a sign-out and the next sign-in. */
export const seriesIsMine = (): boolean => curatorIsMine() && curatorOffers('memories');
