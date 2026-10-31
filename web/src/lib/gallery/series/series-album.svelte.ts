import type { AlbumResponseDto } from '@immich/sdk';
import { toastManager, type ActionItem } from '@immich/ui';
import { mdiCalendarHeartOutline } from '@mdi/js';
import type { MessageFormatter } from 'svelte-i18n';
import { SvelteMap } from 'svelte/reactivity';
import { goto } from '$app/navigation';
import { curatorOffers } from '$lib/gallery/libraries/library-context.svelte';
import { curator, type SmartAlbum } from '$lib/utils/curator';
import { seriesApi, seriesFailure } from './series-api';
import { seriesIsMine, seriesRoute } from './series-route';

// Local Omarchy layer: "A memory a day from this album" (gallery/series), on a smart album's page: in its note
// (components/curator/SmartAlbumBadge) and in its ⋮ menu (services/album.service's Actions, which Ctrl+K offers on the
// album too), for Curator's owner only. Curator opens the album's own series, or makes it (one series an album), and
// the series' page opens on its Coming up; what Curator refuses is a toast in its words. Whether an album is a smart
// one is Curator's to say: asked once for each album the menu is drawn for, and no longer one once the badge's Stop
// updating has stopped it.

/** what Curator said of each album the menu asked about: its smart album, or null for an ordinary one */
const smartOf = new SvelteMap<string, SmartAlbum | null>();
// the albums Curator is being asked about: bookkeeping written while the menu is drawn, so nothing follows it (smartOf
// is what the menu follows)
// eslint-disable-next-line svelte/prefer-svelte-reactivity
const asking = new Set<string>();

/**
 * The smart album behind an album, once Curator has said (it is asked the first time this is read for the album):
 * undefined until then, or while Curator does not answer; null for an ordinary album. Read in a template or an
 * action's $if, it follows Curator's answer. A library whose Curator keeps no smart albums asks nothing.
 */
export const albumSmartAlbum = (albumId: string): SmartAlbum | null | undefined => {
  if (!smartOf.has(albumId) && !asking.has(albumId) && curatorOffers('smart')) {
    asking.add(albumId);
    curator
      .smartForAlbum(albumId)
      .then((smart) => smartOf.set(albumId, smart))
      .catch(() => undefined)
      .finally(() => asking.delete(albumId));
  }
  return smartOf.get(albumId);
};

/** The album no longer updates (its smart rule stopped): it has no series to offer from here. */
export const smartAlbumStopped = (albumId: string) => {
  smartOf.set(albumId, null);
};

/** Every album is asked about again (the specs). */
export const forgetSmartAlbums = () => {
  smartOf.clear();
  asking.clear();
};

let opening = false;

/** The smart album's own series, opened or made, then its page. */
export const openAlbumSeries = async (smartAlbumId: number) => {
  if (opening) {
    return;
  }
  opening = true;
  try {
    const { series } = await seriesApi.create({ smart_album_id: smartAlbumId });
    await goto(seriesRoute(series.id));
  } catch (error) {
    toastManager.danger(seriesFailure(error));
  } finally {
    opening = false;
  }
};

/** The album's menu entry: on a smart album, for whoever has From the beginning. */
export const albumSeriesAction = ($t: MessageFormatter, album: Pick<AlbumResponseDto, 'id'>): ActionItem => ({
  title: $t('memory_series_from_album'),
  icon: mdiCalendarHeartOutline,
  $if: () => seriesIsMine() && !!albumSmartAlbum(album.id),
  onAction: () => {
    const smart = albumSmartAlbum(album.id);
    if (smart) {
      void openAlbumSeries(smart.id);
    }
  },
});
