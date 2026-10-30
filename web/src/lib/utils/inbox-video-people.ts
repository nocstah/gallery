import type { Suggestion } from '$lib/utils/curator';
import { formatDuration } from '$lib/utils/duration';

// Local Omarchy layer: a "People in this video" card (Curator's video.people, curator/video_faces.py). Curator looks
// at several moments of a video, matches the faces to the people the owner named, and proposes the ones it found;
// accepting tags each one on the video as the face editor tags a face on a paused video. The card shows each person
// at their moment: a square of the frame round their face, named, with where in the clip it is.

/** One person on the card: who, their moment (seconds into the clip) and their face's box there. */
export type VideoPerson = {
  person_id: string;
  name: string;
  seconds: number;
  /** x, y, width, height in the pixels of the file Gallery plays */
  box: [number, number, number, number];
};

/** The people a card proposes, in the order they first appear in the clip; none for any other kind. */
export const videoPeopleOf = (suggestion: Pick<Suggestion, 'kind' | 'payload'>): VideoPerson[] => {
  if (suggestion.kind !== 'video.people') {
    return [];
  }
  const people = suggestion.payload?.people;
  return Array.isArray(people)
    ? (people as VideoPerson[]).filter((person) => typeof person?.person_id === 'string' && person.person_id)
    : [];
};

/** The video a card is about. */
export const videoOf = (suggestion: Pick<Suggestion, 'payload' | 'asset_ids'>): string | undefined => {
  const named = suggestion.payload?.asset_id;
  return typeof named === 'string' && named ? named : suggestion.asset_ids[0];
};

/** A person's words on the card: their name and where in the clip ("Anna · 0:12"), as every duration reads. */
export const videoPersonCaption = (person: VideoPerson): string =>
  [person.name?.trim(), Number.isFinite(person.seconds) ? formatDuration(Math.max(0, person.seconds)) : '']
    .filter(Boolean)
    .join(' · ');
