// Local Omarchy layer: the words of the film's song as they are sung (Curator's curator/lyrics.py, from LRCLIB). A song
// without timed lyrics has no lines, and the film shows nothing.

export type LyricLine = { at: number; text: string };

/** a line stays this long at most: past it comes a stretch with no singing */
const LINE_MOST = 9;

/** Shared timings often stamp a song's first line in its intro, with a blank where the singing really begins: the line
 * then waits for that blank's time. */
export const settledLyrics = (lines: LyricLine[]) => {
  const first = lines.findIndex((line) => line.text);
  if (first === -1 || lines[first + 1]?.text !== '' || !lines[first + 2]) {
    return lines;
  }
  const settled = lines.filter((_, index) => index !== first + 1);
  settled[first] = { ...lines[first], at: lines[first + 1].at };
  return settled;
};

/** The words being sung at a song's `time` (seconds); empty between lines. */
export const lyricAt = (lines: LyricLine[], time: number) => {
  let found: LyricLine | undefined;
  for (const line of lines) {
    if (line.at > time) {
      break;
    }
    found = line;
  }
  return found && time - found.at <= LINE_MOST ? found.text : '';
};

const KEPT = 'memory-film-lyrics';

/** The viewer's choice on this device, on until they turn it off. */
export const lyricsWanted = () => {
  try {
    return localStorage.getItem(KEPT) !== 'off';
  } catch {
    return true;
  }
};

export const keepLyricsWanted = (wanted: boolean) => {
  try {
    localStorage.setItem(KEPT, wanted ? 'on' : 'off');
  } catch {
    // not kept here: it holds for this film
  }
};
