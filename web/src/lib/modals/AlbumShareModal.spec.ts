import { AlbumUserRole, SharedLinkType, SharedSpaceRole, type SharedSpaceMemberResponseDto } from '@immich/sdk';
import '@testing-library/jest-dom';
import { cleanup, render, screen, waitFor, within } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { init, register, waitLocale } from 'svelte-i18n';
import { getAnimateMock } from '$lib/__mocks__/animate.mock';
import '$lib/__mocks__/sdk.mock';
import { sdkMock } from '$lib/__mocks__/sdk.mock';
import { albumFactory } from '@test-data/factories/album-factory';
import { sharedLinkFactory } from '@test-data/factories/shared-link-factory';
import { sharedSpaceFactory } from '@test-data/factories/shared-space-factory';
import { userFactory } from '@test-data/factories/user-factory';
import AlbumShareModal from './AlbumShareModal.svelte';

const { makeSharedLink, handleUpdateSharedLink, addUsers } = vi.hoisted(() => ({
  makeSharedLink: vi.fn(),
  handleUpdateSharedLink: vi.fn(),
  addUsers: vi.fn(),
}));

vi.mock('$lib/managers/auth-manager.svelte', () => ({
  authManager: { authenticated: true, user: { id: 'me', isAdmin: false } },
}));
// Library is the album folders' engine; the manager knows it by its id once the folders are in
vi.mock('$lib/managers/album-folders.svelte', () => ({
  isLibrarySpace: (space: { name?: string }) => space.name === 'Library',
}));
vi.mock('$lib/managers/server-config-manager.svelte', () => ({
  serverConfigManager: { value: { externalDomain: 'https://photos.example' } },
}));
vi.mock('$lib/services/album.service', () => ({
  getAlbumActions: () => ({ AddUsers: { title: 'Add people', onAction: addUsers } }),
  handleRemoveUserFromAlbum: vi.fn(),
  handleUpdateUserAlbumRole: vi.fn(),
}));
vi.mock('$lib/services/shared-link.service', () => ({
  makeSharedLink,
  handleUpdateSharedLink,
  shareLinkExpiry: () => '2026-11-15T00:00:00.000Z',
  asUrl: ({ key }: { key: string }) => `https://photos.example/share/${key}`,
  getSharedLinkActions: () => ({
    Copy: { title: 'Copy link', onAction: vi.fn() },
    Delete: { title: 'Delete link', onAction: vi.fn() },
    ViewQrCode: { title: 'View QR code', onAction: vi.fn() },
  }),
}));

const member = (userId: string, name: string, role = SharedSpaceRole.Viewer) =>
  ({
    userId,
    name,
    role,
    email: `${userId}@example.invalid`,
    joinedAt: '',
    showInTimeline: true,
  }) as SharedSpaceMemberResponseDto;
const space = (id: string, name: string, createdAt: string, members = [member('me', 'Me', SharedSpaceRole.Owner)]) =>
  sharedSpaceFactory.build({ id, name, createdAt, createdById: 'me', members });

const library = space('library', 'Library', '2026-10-10T00:00:00.000Z');
const family = space('family', 'Family', '2026-10-11T00:00:00.000Z');
const friends = space('friends', 'Friends', '2026-10-12T00:00:00.000Z');
const cousins = sharedSpaceFactory.build({
  id: 'cousins',
  name: 'Cousins',
  createdAt: '2026-01-01T00:00:00.000Z',
  createdById: 'someone',
  members: [member('someone', 'Someone', SharedSpaceRole.Owner), member('me', 'Me')],
});

const me = userFactory.build({ id: 'me', name: 'Me' });
const makeAlbum = (overrides = {}) =>
  albumFactory.build({
    id: 'album-1',
    albumName: 'Bali',
    albumUsers: [{ user: me, role: AlbumUserRole.Owner }],
    ...overrides,
  });

const open = async (album = makeAlbum()) => {
  sdkMock.getAlbumInfo.mockResolvedValue(album);
  render(AlbumShareModal, { album, onClose: vi.fn() });
  await screen.findByTestId('album-share-spaces');
};

beforeAll(async () => {
  await init({ fallbackLocale: 'en-US' });
  register('en-US', () => import('$i18n/en.json'));
  await waitLocale('en-US');
});

beforeEach(() => {
  vi.resetAllMocks();
  // (the reset takes the setup's stub of `animate` too)
  Element.prototype.animate = getAnimateMock();
  localStorage.clear();
  sdkMock.getAllSharedLinks.mockResolvedValue([]);
  sdkMock.getAllSpaces.mockResolvedValue([library, family, friends, cousins]);
  sdkMock.linkAlbum.mockResolvedValue('');
  sdkMock.unlinkAlbum.mockResolvedValue('');
});

// `Modal` mounts a bits-ui dialog whose body scroll lock releases on a 24ms timer
afterEach(async () => {
  cleanup();
  await new Promise((resolve) => setTimeout(resolve, 30));
});

describe('AlbumShareModal', () => {
  it('leads with the family Space, then the link, then people', async () => {
    await open();

    const sections = [...document.querySelectorAll('.ws-sheet-section')].map((section) => section.dataset.testid);
    expect(sections).toEqual(['album-share-spaces', 'album-share-links', 'album-share-people']);
    expect(screen.getByRole('switch', { name: 'Show in Family' })).toBeInTheDocument();
    expect(screen.getByText('Only you so far. Family members see it once they have accounts.')).toBeInTheDocument();
  });

  it('offers the other Spaces I can add to quietly, never Library or one I can only look at', async () => {
    await open();

    expect(screen.getByRole('switch', { name: 'Show in Friends' }).closest('.ws-sheet-row')).not.toBeNull();
    expect(screen.queryByRole('switch', { name: 'Show in Library' })).not.toBeInTheDocument();
    expect(screen.queryByRole('switch', { name: 'Show in Cousins' })).not.toBeInTheDocument();
  });

  it('names who else sees it', async () => {
    sdkMock.getAllSpaces.mockResolvedValue([
      space('family', 'Family', '2026-10-11T00:00:00.000Z', [
        member('me', 'Me', SharedSpaceRole.Owner),
        member('anna', 'Anna'),
        member('ben', 'Ben', SharedSpaceRole.Editor),
      ]),
    ]);
    await open();

    expect(screen.getByText('Anna and Ben see it too.')).toBeInTheDocument();
  });

  it('leads with the Space the album already shows in', async () => {
    await open(
      makeAlbum({
        sharedSpaceLinks: [{ spaceId: 'friends', spaceName: 'Friends', linkedById: 'me', showInTimeline: true }],
      }),
    );

    const lead = screen.getByRole('switch', { name: 'Show in Friends' });
    expect(lead.closest('.ws-sheet-row')).toBeNull();
    expect(lead).toBeChecked();
  });

  it('shows the album in the Space through linkAlbum, and that Space leads the next sheet', async () => {
    await open();

    await userEvent.click(screen.getByRole('switch', { name: 'Show in Family' }));

    await waitFor(() => expect(sdkMock.linkAlbum).toHaveBeenCalledWith({ id: 'family', albumId: 'album-1' }));
    expect(sdkMock.unlinkAlbum).not.toHaveBeenCalled();
    expect(localStorage.getItem('gallery.lastShareSpace')).toBe('family');
  });

  it('takes it out of the Space again through unlinkAlbum', async () => {
    await open(
      makeAlbum({
        sharedSpaceLinks: [{ spaceId: 'family', spaceName: 'Family', linkedById: 'me', showInTimeline: true }],
      }),
    );

    await userEvent.click(screen.getByRole('switch', { name: 'Show in Family' }));

    await waitFor(() => expect(sdkMock.unlinkAlbum).toHaveBeenCalledWith({ id: 'family', albumId: 'album-1' }));
    expect(sdkMock.linkAlbum).not.toHaveBeenCalled();
  });

  it('says in one line when there is no Space to show it in', async () => {
    sdkMock.getAllSpaces.mockResolvedValue([library]);
    await open();

    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
    expect(
      within(screen.getByTestId('album-share-spaces')).getByText(
        'No Spaces yet. Make one under Shared to share a library with your family.',
      ),
    ).toBeInTheDocument();
  });

  it('makes a link in one press, with a new link’s defaults', async () => {
    await open();
    expect(
      screen.getByText('No link yet. A link opens for anyone who has it, without an account.'),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Make a link' }));

    expect(makeSharedLink).toHaveBeenCalledWith({
      type: SharedLinkType.Album,
      albumId: 'album-1',
      allowDownload: true,
      allowUpload: false,
      showMetadata: false,
      expiresAt: '2026-11-15T00:00:00.000Z',
    });
  });

  it('shows the newest link with its QR and public address, and no second Make a link', async () => {
    sdkMock.getAllSharedLinks.mockResolvedValue([
      sharedLinkFactory.build({ key: 'older', createdAt: '2026-01-01T00:00:00.000Z', expiresAt: null }),
      sharedLinkFactory.build({ key: 'newer', createdAt: '2026-10-01T00:00:00.000Z', expiresAt: null }),
    ]);
    await open();

    const panel = screen.getByTestId('share-link');
    expect(within(panel).getByTestId('share-link-url')).toHaveTextContent('https://photos.example/share/newer');
    expect(await within(panel).findByRole('img', { name: 'QR code image' })).toHaveAttribute(
      'src',
      expect.stringMatching(/^data:image\/svg\+xml/),
    );
    expect(screen.queryByRole('button', { name: 'Make a link' })).not.toBeInTheDocument();
  });

  it('lists people last, with Add user', async () => {
    const anna = userFactory.build({ id: 'anna', name: 'Anna' });
    await open(
      makeAlbum({
        albumUsers: [
          { user: me, role: AlbumUserRole.Owner },
          { user: anna, role: AlbumUserRole.Editor },
        ],
      }),
    );

    const people = screen.getByTestId('album-share-people');
    expect(within(people).getByText('Anna')).toBeInTheDocument();
    await userEvent.click(within(people).getByRole('button', { name: 'Add people' }));
    expect(addUsers).toHaveBeenCalled();
  });
});
