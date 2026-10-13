import { getAllAlbums } from '@immich/sdk';
import { redirect } from '@sveltejs/kit';
import { TODO_NAME } from '$lib/managers/todo-manager.svelte';
import { Route } from '$lib/route';
import { authenticate } from '$lib/utils/auth';
import { getFormatter } from '$lib/utils/i18n';
import type { PageLoad } from './$types';

// Local Omarchy layer: the sidebar's To do opens the To do album (managers/todo-manager), or, before anything has been
// set aside, says how to fill it
export const load = (async ({ url }) => {
  await authenticate(url);
  const [album] = await getAllAlbums({ name: TODO_NAME, isOwned: true });
  if (album) {
    redirect(307, Route.viewAlbum({ id: album.id }));
  }
  const $t = await getFormatter();

  return {
    meta: {
      title: $t('todo'),
    },
  };
}) satisfies PageLoad;
