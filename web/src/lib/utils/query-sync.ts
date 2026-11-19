// Local Omarchy layer: since v5.11 (Immich v3.4) upstream's views read albums and shared links through queries
// (queries/album.query, queries/shared-link.query), which its own mutations refresh. Kioku's own writes (a merge, an
// undo, an album made from a selection or in the collection picker, a title changed in the bar, a link turned off from
// its row or a memory's share sheet) call the SDK and say so on the event manager. This refreshes the queries from
// those events, so a Kioku write shows in every view. Installed once, by the root layout.
import { eventManager } from '#lib/managers/event-manager.svelte.ts';
import { getAlbumInfoQuery, invalidateAlbum, invalidateAlbums } from '#lib/queries/album.query.ts';
import { queryClient } from '#lib/queries/client.ts';
import { getAllSharedLinksQuery } from '#lib/queries/shared-link.query.ts';

const refresh = (albumIds: string[]) => Promise.all([...albumIds.map((id) => invalidateAlbum(id)), invalidateAlbums()]);

export const installQuerySync = () =>
  eventManager.on({
    AlbumCreate: () => void invalidateAlbums(),
    AlbumUpdate: (album) => {
      queryClient.setQueryData(getAlbumInfoQuery(album.id).queryKey, album);
      void refresh([album.id]);
    },
    AlbumDelete: (album) => {
      queryClient.removeQueries({ queryKey: getAlbumInfoQuery(album.id).queryKey });
      void invalidateAlbums();
    },
    AlbumAddAssets: ({ albumIds }) => void refresh(albumIds),
    AlbumRemoveAssets: ({ albumIds }) => void refresh(albumIds),
    // the Shared links page drops the link, and an album's sharing reads again (as upstream's delete mutation does)
    SharedLinkDelete: (sharedLink) => {
      void queryClient.invalidateQueries({ queryKey: getAllSharedLinksQuery().queryKey, exact: true });
      void refresh(sharedLink.album ? [sharedLink.album.id] : []);
    },
  });
