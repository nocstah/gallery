// Local Omarchy layer: QR's bank slips, so that no album wears one for its cover. QR itself wears its icon wherever an
// album's cover shows (AlbumCover, iconCover), but the bank apps' albums (Bank A, Bank B, Bank C) hold nothing but
// slips, and each had one for its cover: amounts, names and a QR code, legible on the Albums page's larger covers. Such an
// album wears QR's icon too. The Albums page reads QR's photos in its load, so no slip shows before they are known, once
// per page load and again when QR's count says they changed; elsewhere AlbumCover goes by what was read last. Only the
// owner has QR (managers/special-albums).
import { searchAssets } from '@immich/sdk';
import { SvelteSet } from 'svelte/reactivity';
import { qrManager } from '$lib/managers/special-albums.svelte';

/** QR's photos read per request, page after page. */
const PAGE = 1000;

export class SlipCoverManager {
  #ids = new SvelteSet<string>();
  /** QR's count when its photos were read */
  #count: number | undefined;
  #reading: Promise<void> | undefined;

  /** Whether a photo is one of QR's slips, as last read. */
  isSlip(assetId: string | null | undefined) {
    return !!assetId && this.#ids.has(assetId);
  }

  /** Reads QR's photos, unless they were read at the count QR has now; a failed read keeps what was read before. */
  async load() {
    if (!qrManager.offered) {
      return;
    }
    const albumId = await qrManager.ready();
    if (!albumId) {
      this.#ids.clear();
      this.#count = undefined;
      return;
    }
    if (this.#count !== undefined && this.#count === qrManager.count) {
      return;
    }
    this.#reading ??= this.#read(albumId).finally(() => {
      this.#reading = undefined;
    });
    return this.#reading;
  }

  async #read(albumId: string) {
    const count = qrManager.count;
    try {
      const ids: string[] = [];
      for (let page = 1; ; page++) {
        const { assets } = await searchAssets({ metadataSearchDto: { albumIds: [albumId], size: PAGE, page } });
        ids.push(...assets.items.map(({ id }) => id));
        if (!assets.nextPage) {
          break;
        }
      }
      // in one go, so the covers change once
      this.#ids.clear();
      for (const id of ids) {
        this.#ids.add(id);
      }
      this.#count = count;
    } catch {
      // the covers stay as they were read last (none, the first time)
    }
  }
}

export const slipCovers = new SlipCoverManager();
