import type { AssetResponseDto } from '@immich/sdk';
import { fromISODateTime, fromISODateTimeUTC } from '$lib/utils/timeline-util';

// Local Omarchy layer: when the photo was taken, as the viewer's bar says it on a phone (AssetViewerNavBar), beside
// the back arrow: the day with its year (fifty years of photos: the year is never taken for granted) and the time. The
// moment is the one the Info panel's Details row shows (DetailPanelDate): the camera's own clock in its own time zone
// where the photo carries one, else the local time the server worked out for it.

export type ViewerTaken = { date: string; time: string };

export const viewerTaken = (
  asset: Pick<AssetResponseDto, 'exifInfo' | 'localDateTime'>,
  locale?: string,
): ViewerTaken | undefined => {
  const timeZone = asset.exifInfo?.timeZone ?? undefined;
  const original = asset.exifInfo?.dateTimeOriginal;
  const dateTime =
    timeZone && original
      ? fromISODateTime(original, timeZone)
      : asset.localDateTime
        ? fromISODateTimeUTC(asset.localDateTime)
        : undefined;
  if (!dateTime?.isValid) {
    return undefined;
  }
  return {
    date: dateTime.toLocaleString({ weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }, { locale }),
    time: dateTime.toLocaleString({ hour: 'numeric', minute: '2-digit' }, { locale }),
  };
};
