import { AssetTypeEnum, AssetVisibility, type AssetResponseDto } from '@immich/sdk';
import { curatorOffers } from '$lib/gallery/libraries/library-context.svelte';
import { authManager } from '$lib/managers/auth-manager.svelte';
import { curatorIsMine } from '$lib/utils/curator';

type ShareableAsset = Pick<AssetResponseDto, 'ownerId' | 'isTrashed' | 'visibility' | 'livePhotoVideoId'> & {
  type?: AssetTypeEnum;
  isVideo?: boolean;
};

/** Keep the download available after a failed health check; the conversion panel handles failures and retry. Local
 * Omarchy layer: only where this library's Curator makes videos for chat apps (gallery/libraries). */
export const canShareVideo = (asset: ShareableAsset): boolean =>
  curatorIsMine() &&
  curatorOffers('share') &&
  !authManager.isSharedLink &&
  asset.ownerId === authManager.user.id &&
  !asset.isTrashed &&
  asset.visibility !== AssetVisibility.Locked &&
  (asset.type === AssetTypeEnum.Video || asset.isVideo === true || !!asset.livePhotoVideoId);
