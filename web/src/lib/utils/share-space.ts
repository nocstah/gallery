// Local Omarchy layer: the Spaces the Share sheet offers (modals/AlbumShareModal) and the one that leads it. The owner
// shares with the family first ("Family default target"), but no Space is known here by its name. The lead is, in this
// order: a Space the album already shows in; the Space the last share went to in this browser (an album shown there);
// else the oldest Space offered, which is the family's own as a rule, since it is made first and stays. Only Spaces I
// can add to are offered (owner or editor), never Library, the album folders' engine (managers/album-folders), and the
// rest follow the lead quietly, oldest first.
import type { SharedSpaceResponseDto } from '@immich/sdk';
import type { MessageFormatter } from 'svelte-i18n';
import { isWritableSpace } from '$lib/components/shared-components/collection-selection/collection-selection-utils';
import { isLibrarySpace } from '$lib/managers/album-folders.svelte';

const KEY = 'gallery.lastShareSpace';

/** The Spaces I can share into, oldest first: Library left out, and any I may only look at. */
export const shareableSpaces = (spaces: SharedSpaceResponseDto[], userId: string | null) =>
  spaces
    .filter((space) => !isLibrarySpace(space) && isWritableSpace(space, userId))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

/** The Space that leads the sheet, of those it offers (oldest first); see the head of this file. */
export const leadSpace = (
  spaces: SharedSpaceResponseDto[],
  shownIn: ReadonlySet<string> = new Set(),
): SharedSpaceResponseDto | undefined => {
  const last = lastShareSpaceId();
  return spaces.find(({ id }) => shownIn.has(id)) ?? spaces.find(({ id }) => id === last) ?? spaces[0];
};

export const rememberShareSpace = (spaceId: string) => {
  try {
    localStorage.setItem(KEY, spaceId);
  } catch {
    // storage blocked: the oldest Space leads
  }
};

export const lastShareSpaceId = (): string | undefined => {
  try {
    return localStorage.getItem(KEY) ?? undefined;
  } catch {
    return undefined;
  }
};

/** How many names a line spells out before the rest become "and 3 others". */
const NAMED = 3;

/**
 * Who sees what goes into the Space, in one line: the other members by name ("Anna and Ben see it too"), or, while I am
 * its only member, that the family sees it once they have accounts. `alone` and `audience` are the sheet's own keys
 * (an album is "it"; photos are "it" or "them" by their `count`, passed in `values`); `audience` also takes the names
 * and how many people they are (`people`), for the verb's agreement.
 */
export const spaceAudience = (
  $t: MessageFormatter,
  lang: string,
  space: SharedSpaceResponseDto,
  userId: string | null,
  keys: { alone: string; audience: string },
  values: Record<string, number> = {},
) => {
  const others = (space.members ?? []).filter((member) => member.userId !== userId).map(({ name }) => name);
  if (others.length === 0) {
    return $t(keys.alone, { values });
  }
  const named = others.length > NAMED + 1 ? others.slice(0, NAMED) : others;
  const rest = others.length - named.length;
  const parts = rest > 0 ? [...named, $t('share_more_people', { values: { count: rest } })] : named;
  let names: string;
  try {
    names = new Intl.ListFormat(lang, { type: 'conjunction' }).format(parts);
  } catch {
    names = parts.join(', ');
  }
  return $t(keys.audience, { values: { ...values, names, people: others.length } });
};
