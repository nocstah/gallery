// Local Omarchy layer: where QR's bank slips never show (DESIGN.md, Special albums: QR, whose bank slips are not for
// looking at). An album's cover: QR's is its icon (iconCover), and so is any album's whose cover is one of QR's slips
// (the bank apps' albums: managers/slip-covers). A photo where Photos' photos show outside Photos (Ctrl+K's results,
// its previews and its recents): only one Photos would show, on the timeline, and never one of QR's. Every slip the
// house recognises is archived, filed into QR or kept out by Gallery's receipts classification (Auto/Receipts), so the
// timeline alone keeps them out, and QR's own stay out whatever their visibility.
import { AssetVisibility, type AssetResponseDto } from '@immich/sdk';
import { slipCovers } from '$lib/managers/slip-covers.svelte';
import { qrManager, specialAlbumOf, type SpecialAlbumManager } from '$lib/managers/special-albums.svelte';

/** The special album whose icon covers an album (QR, or QR's for an album whose cover is one of its slips), if any. */
export const iconCoverOf = (
  albumId: string | null | undefined,
  coverAssetId: string | null | undefined,
): SpecialAlbumManager | undefined => {
  const special = specialAlbumOf(albumId);
  if (special?.iconCover) {
    return special;
  }
  return slipCovers.isSlip(coverAssetId) ? qrManager : undefined;
};

/**
 * Whether a photo may show among the photos Ctrl+K offers: on the timeline (where its visibility is known), and not one
 * of QR's slips, by QR's photos as last read or by QR's tag, which the special album gives what it holds.
 */
export const shownAmongPhotos = (
  asset: Pick<AssetResponseDto, 'id'> & Partial<Pick<AssetResponseDto, 'visibility' | 'tags'>>,
) => {
  if (asset.visibility !== undefined && asset.visibility !== AssetVisibility.Timeline) {
    return false;
  }
  if (slipCovers.isSlip(asset.id)) {
    return false;
  }
  return !(qrManager.offered && asset.tags?.some(({ value }) => value === qrManager.name));
};
