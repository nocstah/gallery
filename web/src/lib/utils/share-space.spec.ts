import { SharedSpaceRole, type SharedSpaceMemberResponseDto } from '@immich/sdk';
import type { MessageFormatter } from 'svelte-i18n';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { sharedSpaceFactory } from '@test-data/factories/shared-space-factory';
import { lastShareSpaceId, leadSpace, rememberShareSpace, shareableSpaces, spaceAudience } from './share-space';

// Library is the album folders' engine; the manager knows it by its id once the folders are in
vi.mock('$lib/managers/album-folders.svelte', () => ({
  isLibrarySpace: (space: { name?: string }) => space.name === 'Library',
}));

const ME = 'me';
const member = (userId: string, name: string, role = SharedSpaceRole.Viewer) =>
  ({
    userId,
    name,
    role,
    email: `${userId}@example.invalid`,
    joinedAt: '',
    showInTimeline: true,
  }) as SharedSpaceMemberResponseDto;
const space = (id: string, name: string, createdAt: string, members = [member(ME, 'Me', SharedSpaceRole.Owner)]) =>
  sharedSpaceFactory.build({ id, name, createdAt, createdById: ME, members });

const family = space('family', 'Family', '2026-10-11T10:00:00.000Z');
const library = space('library', 'Library', '2026-10-10T10:00:00.000Z');
const friends = space('friends', 'Friends', '2026-10-12T10:00:00.000Z');
// someone else's Space where I may only look
const viewOnly = sharedSpaceFactory.build({
  id: 'view-only',
  name: 'Cousins',
  createdAt: '2026-01-01T00:00:00.000Z',
  createdById: 'someone',
  members: [member('someone', 'Someone', SharedSpaceRole.Owner), member(ME, 'Me')],
});

afterEach(() => localStorage.clear());

describe('shareableSpaces', () => {
  it('offers the Spaces I can add to, oldest first, never Library', () => {
    expect(shareableSpaces([friends, library, viewOnly, family], ME).map(({ id }) => id)).toEqual([
      'family',
      'friends',
    ]);
  });
});

describe('leadSpace', () => {
  const offered = [family, friends];

  it('leads with the oldest Space when nothing else says otherwise', () => {
    expect(leadSpace(offered)?.id).toBe('family');
  });

  it('leads with the Space the last share went to', () => {
    rememberShareSpace('friends');
    expect(lastShareSpaceId()).toBe('friends');
    expect(leadSpace(offered)?.id).toBe('friends');
  });

  it('leads with a Space the album already shows in, before the last share', () => {
    rememberShareSpace('family');
    expect(leadSpace(offered, new Set(['library', 'friends']))?.id).toBe('friends');
  });

  it('ignores a remembered Space that is no longer offered', () => {
    rememberShareSpace('gone');
    expect(leadSpace(offered)?.id).toBe('family');
  });

  it('has no lead without Spaces', () => {
    expect(leadSpace([])).toBeUndefined();
  });
});

describe('spaceAudience', () => {
  const $t = ((key: string, options?: { values?: Record<string, unknown> }) =>
    `${key}${options?.values ? ' ' + JSON.stringify(options.values) : ''}`) as MessageFormatter;
  const keys = { alone: 'album_share_space_alone', audience: 'album_share_space_audience' } as const;

  it('says the family sees it once they have accounts while I am alone in the Space', () => {
    expect(spaceAudience($t, 'en', family, ME, keys, { count: 2 })).toBe('album_share_space_alone {"count":2}');
  });

  it('names the other members, with their number for the verb', () => {
    const shared = space('family', 'Family', '', [
      member(ME, 'Me', SharedSpaceRole.Owner),
      member('anna', 'Anna'),
      member('ben', 'Ben'),
    ]);
    expect(spaceAudience($t, 'en', shared, ME, keys)).toBe(
      'album_share_space_audience {"names":"Anna and Ben","people":2}',
    );
  });

  it('names three and counts the rest once there are more than four', () => {
    const many = ['Anna', 'Ben', 'Cleo', 'Dan', 'Eve'].map((name) => member(name.toLowerCase(), name));
    const shared = space('family', 'Family', '', [member(ME, 'Me', SharedSpaceRole.Owner), ...many]);
    expect(spaceAudience($t, 'en', shared, ME, keys)).toBe(
      String.raw`album_share_space_audience {"names":"Anna, Ben, Cleo, and share_more_people {\"count\":2}","people":5}`,
    );
  });
});
