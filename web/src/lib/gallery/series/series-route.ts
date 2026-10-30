import { curatorOffers } from '$lib/gallery/libraries/library-context.svelte';
import { curatorIsMine } from '$lib/utils/curator';

// Local Omarchy layer: where "From the beginning" lives, and who has it (gallery/series). It is one of the owner's tools
// ("Owner tools only for me"): Curator's owner, in a library whose Curator offers what it adds to memories. A vault's
// Gallery and a library without such a Curator leave the page out (gallery/edition, gallery/libraries).

export const SERIES_ROUTE = '/from-the-beginning';

/** Whether whoever is signed in has the page: read in a template, it follows a sign-out and the next sign-in. */
export const seriesIsMine = (): boolean => curatorIsMine() && curatorOffers('memories');
