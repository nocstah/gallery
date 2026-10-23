import { AssetMediaSize } from '@immich/sdk';
import { getAssetMediaUrl } from '$lib/utils';
import { reelUrl, type Suggestion } from '$lib/utils/curator';

export type InspectionItem = {
  src?: string;
  assetId?: string;
  videoSrc?: string;
  turn?: number;
  label?: 'ai_inbox_now' | 'ai_inbox_proposed';
  restore?: Suggestion;
};

/** All of a suggestion's evidence stays available without leaving the review. */
export const inspectionItems = (suggestion: Suggestion): InspectionItem[] => {
  const payload = suggestion.payload as Record<string, unknown>;
  const photos = [...new Set(suggestion.asset_ids)];
  const photo = (assetId: string, label?: InspectionItem['label'], turn = 0): InspectionItem => ({
    assetId,
    label,
    turn,
    src: getAssetMediaUrl({ id: assetId, size: AssetMediaSize.Preview }),
  });
  const face = (id: string): InspectionItem => ({ src: `/api/people/${id}/thumbnail` });
  if (suggestion.status === 'pending') {
    if (suggestion.kind === 'restore.publish') {
      return [{ restore: suggestion }];
    }
    if (suggestion.kind === 'reel.publish') {
      return [{ videoSrc: reelUrl(suggestion.id) }];
    }
  }
  if (suggestion.kind === 'stack.cover' && photos.length > 1) {
    return [photo(photos[1], 'ai_inbox_now'), photo(photos[0], 'ai_inbox_proposed')];
  }
  if (suggestion.kind === 'asset.rotate' && photos.length > 0) {
    return [
      photo(photos[0], 'ai_inbox_now'),
      photo(photos[0], 'ai_inbox_proposed', Number(payload.rotation ?? payload.angle ?? 0)),
    ];
  }
  if (suggestion.kind === 'person.portrait') {
    return [
      { ...face(suggestion.target_id), label: 'ai_inbox_now' },
      { src: `/api/people/${suggestion.target_id}/faces/${payload.face_id}/thumbnail`, label: 'ai_inbox_proposed' },
      ...photos.map((id) => photo(id)),
    ];
  }
  const faces =
    suggestion.kind === 'person.merge'
      ? [String(payload.into_id), ...((payload.ids as string[] | undefined) ?? [])]
      : ['person.name', 'person.hide'].includes(suggestion.kind)
        ? [suggestion.target_id]
        : suggestion.kind === 'smart.create'
          ? ((payload.person_ids as string[] | undefined) ?? [])
          : [];
  const allPhotos = [...new Set((payload.asset_ids as string[] | undefined) ?? photos)];
  return [...new Set(faces)].map((id) => face(id)).concat(allPhotos.map((id) => photo(id)));
};
