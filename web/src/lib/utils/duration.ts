// Local Omarchy layer: one way to write how long something runs (DESIGN.md, Photo Tile): m:ss under an hour and
// h:mm:ss from an hour on ("0:18", "1:16", "1:02:03"), whole seconds, wherever a duration shows (a video's tile, the
// inspector, the AI inbox's clips). Tiles had read "0:18" beside "01:16" (m:ss under a minute, mm:ss under an hour),
// and the inspector and the inbox ran past an hour as "75:23". The viewer's own player (media-chrome) writes its times
// the same way.

/** How long `seconds` runs, as m:ss or h:mm:ss; a fraction of a second is left off, as a clock does. */
export const formatDuration = (seconds: number): string => {
  const total = Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : 0;
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const rest = String(total % 60).padStart(2, '0');
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, '0')}:${rest}` : `${minutes}:${rest}`;
};
