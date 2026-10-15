// Local Omarchy layer: waiting for the server to draw an edit (a rotation) before showing it. The server says so with
// AssetEditReadyV2, but a busy thumbnail queue can take longer than the few seconds a rotation used to wait, and a
// socket can miss the event; then the photo kept its old picture until a reload while a toast said the rotation had
// failed. This waits for the event or, failing that, for the photo's thumbhash to change, for up to a minute, and
// returns the photo as the server now has it.
import { getAssetInfo, type AssetResponseDto } from '@immich/sdk';
import { waitForWebsocketEvent } from '$lib/stores/websocket';
import { sleep } from '$lib/utils';

const POLL_MS = 1500;

/** Start it before the edit request, so the event cannot slip past; it resolves once the edit is drawn. */
export const waitForEditRendered = async (
  id: string,
  previousThumbhash: string | null | undefined,
  timeout = 60_000,
): Promise<AssetResponseDto> => {
  let settled = false;
  const ready = waitForWebsocketEvent('AssetEditReadyV2', (event) => event.asset.id === id, timeout).then(
    () => undefined,
  );
  const changed = (async () => {
    const deadline = Date.now() + timeout;
    while (!settled && Date.now() < deadline) {
      await sleep(POLL_MS);
      const asset = settled ? undefined : await getAssetInfo({ id }).catch(() => undefined);
      if (asset && asset.thumbhash !== previousThumbhash) {
        return asset;
      }
    }
    throw new Error(`the edit of ${id} was not drawn within ${timeout} ms`);
  })();
  try {
    return (await Promise.any([ready, changed])) ?? (await getAssetInfo({ id }));
  } finally {
    settled = true;
  }
};
