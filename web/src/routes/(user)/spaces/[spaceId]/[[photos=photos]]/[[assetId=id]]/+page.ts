import { redirect } from '@sveltejs/kit';
import { Route } from '$lib/route';
import { authenticate } from '$lib/utils/auth';
import type { PageLoad } from './$types';

// space + members come from the parent [spaceId] layout load.
export const load = (async ({ url, params, parent }) => {
  await authenticate(url);
  const { space, members, linkedAlbums } = await parent();
  // Local Omarchy layer: a Space of one with albums (Library, where the albums live) opens on its albums; its photos
  // stay at /photos, and a link into the photos (an asset, ?at=, a search) is left where it points
  if (!params.photos && !params.assetId && !url.search && members.length <= 1 && linkedAlbums.length > 0) {
    redirect(307, Route.viewSpaceAlbums({ id: space.id }));
  }
  return {};
}) satisfies PageLoad;
