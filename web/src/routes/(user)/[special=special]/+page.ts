import { getAllAlbums } from '@immich/sdk';
import { error, redirect } from '@sveltejs/kit';
import { specialAlbums } from '$lib/managers/special-albums.svelte';
import { Route } from '$lib/route';
import { authenticate } from '$lib/utils/auth';
import { getFormatter } from '$lib/utils/i18n';
import type { PageLoad } from './$types';

// Local Omarchy layer: a special album's sidebar row (/todo, /villa: managers/special-albums) opens the album, or, before
// anything has gone there, says how to fill it
export const load = (async ({ params, url }) => {
  await authenticate(url);
  const special = specialAlbums.find(({ slug }) => slug === params.special);
  if (!special) {
    error(404);
  }
  // Villa and QR are the owner's own: a family account lands on Photos (managers/special-albums, `offered`)
  if (!special.offered) {
    redirect(307, Route.photos());
  }
  const [album] = await getAllAlbums({ name: special.name, isOwned: true });
  if (album) {
    redirect(307, Route.viewAlbum({ id: album.id }));
  }
  const $t = await getFormatter();

  return {
    slug: special.slug,
    meta: {
      title: $t(special.words.label),
    },
  };
}) satisfies PageLoad;
