import { SharedLinkType, SharedSpaceRole, type SharedSpaceMemberResponseDto } from '@immich/sdk';
import '@testing-library/jest-dom';
import { cleanup, render, screen, waitFor, within } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { init, register, waitLocale } from 'svelte-i18n';
import { getAnimateMock } from '$lib/__mocks__/animate.mock';
import '$lib/__mocks__/sdk.mock';
import { sdkMock } from '$lib/__mocks__/sdk.mock';
import { sharedLinkFactory } from '@test-data/factories/shared-link-factory';
import { sharedSpaceFactory } from '@test-data/factories/shared-space-factory';
import SelectionShareModal from './SelectionShareModal.svelte';

const { makeSharedLink, addAssetsToCollections } = vi.hoisted(() => ({
  makeSharedLink: vi.fn(),
  addAssetsToCollections: vi.fn(),
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
// the Add to album or space picker's own dispatch
vi.mock('$lib/services/collection.service', () => ({ addAssetsToCollections }));
vi.mock('$lib/services/shared-link.service', () => ({
  makeSharedLink,
  asUrl: ({ key }: { key: string }) => `https://photos.example/share/${key}`,
  getSharedLinkActions: () => ({
    Copy: { title: 'Copy link', onAction: vi.fn() },
    Delete: { title: 'Delete link', onAction: vi.fn() },
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

type Props = {
  assetIds: string[];
  ownedAssetIds: string[];
  excludedCount?: number;
  spaceId?: string;
  contributedCount?: number;
  fromSpaceId?: string;
};

const open = async (props: Props) => {
  render(SelectionShareModal, { ...props, onClose: vi.fn() });
  await screen.findByTestId('selection-share-spaces');
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
  sdkMock.getAllSpaces.mockResolvedValue([library, family, friends]);
  addAssetsToCollections.mockResolvedValue(true);
});

// `Modal` mounts a bits-ui dialog whose body scroll lock releases on a 24ms timer
afterEach(async () => {
  cleanup();
  await new Promise((resolve) => setTimeout(resolve, 30));
});

describe('SelectionShareModal', () => {
  it('counts the selection and leads with Add to Family, then the link', async () => {
    await open({ assetIds: ['a1', 'a2'], ownedAssetIds: ['a1', 'a2'], excludedCount: 1 });

    expect(screen.getByText('Share 3 photos')).toBeInTheDocument();
    const sections = [...document.querySelectorAll('.ws-sheet-section')].map((section) => section.dataset.testid);
    expect(sections).toEqual(['selection-share-spaces', 'selection-share-link']);
    expect(screen.getByRole('button', { name: 'Add to Family' })).toHaveClass('ws-sheet-primary');
    expect(screen.getByRole('button', { name: 'Add to Friends' })).toHaveClass('ws-sheet-quiet');
    expect(screen.queryByRole('button', { name: 'Add to Library' })).not.toBeInTheDocument();
    expect(screen.getByText('Only you so far. Family members see them once they have accounts.')).toBeInTheDocument();
  });

  it('adds my own photos to the Space through the picker’s dispatch, then says so', async () => {
    await open({ assetIds: ['a1'], ownedAssetIds: ['a1'] });

    await userEvent.click(screen.getByRole('button', { name: 'Add to Family' }));

    expect(addAssetsToCollections).toHaveBeenCalledWith(
      [expect.objectContaining({ kind: 'space', id: 'family' })],
      ['a1'],
    );
    expect(await screen.findByRole('status')).toHaveTextContent('Added to Family');
    expect(screen.queryByRole('button', { name: 'Add to Family' })).not.toBeInTheDocument();
    expect(localStorage.getItem('gallery.lastShareSpace')).toBe('family');
  });

  it('keeps the button when the Space did not take them', async () => {
    addAssetsToCollections.mockResolvedValue(false);
    await open({ assetIds: ['a1'], ownedAssetIds: ['a1'] });

    await userEvent.click(screen.getByRole('button', { name: 'Add to Family' }));

    await waitFor(() => expect(screen.getByRole('button', { name: 'Add to Family' })).toBeEnabled());
    expect(localStorage.getItem('gallery.lastShareSpace')).toBeNull();
  });

  it('leads with the Space the last share went to', async () => {
    localStorage.setItem('gallery.lastShareSpace', 'friends');
    await open({ assetIds: ['a1'], ownedAssetIds: ['a1'] });

    expect(screen.getByRole('button', { name: 'Add to Friends' })).toHaveClass('ws-sheet-primary');
  });

  it('does not offer the Space the photos are seen in', async () => {
    sdkMock.getAllSpaces.mockResolvedValue([library, family]);
    await open({ assetIds: ['a1', 'a2'], ownedAssetIds: ['a1', 'a2'], fromSpaceId: 'family' });

    expect(screen.queryByRole('button', { name: 'Add to Family' })).not.toBeInTheDocument();
    expect(screen.getByText('These photos are in Family.')).toBeInTheDocument();
  });

  it('speaks of one photo as one photo', async () => {
    sdkMock.getAllSpaces.mockResolvedValue([library, family]);
    await open({ assetIds: ['a1'], ownedAssetIds: ['a1'], fromSpaceId: 'family' });

    expect(screen.getByText('Share 1 photo')).toBeInTheDocument();
    expect(screen.getByText('This photo is in Family.')).toBeInTheDocument();
    expect(
      screen.getByText('No link yet. A link opens this photo for anyone who has it, without an account.'),
    ).toBeInTheDocument();
  });

  it('sends only my own photos to a Space and says how many stay out', async () => {
    await open({ assetIds: ['a1', 'b1', 'b2'], ownedAssetIds: ['a1'], spaceId: 'family-space', contributedCount: 2 });

    expect(screen.getByText("2 of them aren't yours and stay out.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Add to Family' }));
    expect(addAssetsToCollections).toHaveBeenCalledWith(expect.anything(), ['a1']);
  });

  it('offers no Space when none of the photos are mine', async () => {
    await open({ assetIds: ['b1'], ownedAssetIds: [], spaceId: 'family-space', contributedCount: 1 });

    expect(screen.queryByRole('button', { name: /^Add to/ })).not.toBeInTheDocument();
    expect(screen.getByText('Only your own photos can go into a Space.')).toBeInTheDocument();
  });

  it('makes a link of the photos the link covers, in one press', async () => {
    makeSharedLink.mockResolvedValue(sharedLinkFactory.build({ key: 'made', expiresAt: null }));
    await open({ assetIds: ['a1', 'a2'], ownedAssetIds: ['a1', 'a2'] });

    await userEvent.click(screen.getByRole('button', { name: 'Make a link' }));

    expect(makeSharedLink).toHaveBeenCalledWith({
      type: SharedLinkType.Individual,
      assetIds: ['a1', 'a2'],
      spaceId: undefined,
      allowDownload: true,
      allowUpload: false,
      showMetadata: false,
      expiresAt: null,
    });
    const panel = await screen.findByTestId('share-link');
    expect(within(panel).getByTestId('share-link-url')).toHaveTextContent('https://photos.example/share/made');
    expect(screen.queryByRole('button', { name: 'Make a link' })).not.toBeInTheDocument();
  });

  // #1018: on a Space that scopes the link to itself, other members' photos become public through it
  it('warns before a link makes other members’ photos public, and sends the Space', async () => {
    await open({ assetIds: ['a1', 'b1'], ownedAssetIds: ['a1'], spaceId: 'family-space', contributedCount: 1 });

    expect(screen.getByTestId('shared-link-contributed-warning')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Make a link' }));
    expect(makeSharedLink).toHaveBeenCalledWith(
      expect.objectContaining({ assetIds: ['a1', 'b1'], spaceId: 'family-space' }),
    );
  });

  // #853: off a Space, a link takes only my own photos, and the sheet says what it leaves out
  it('says how many selected photos the link leaves out', async () => {
    await open({ assetIds: ['a1'], ownedAssetIds: ['a1'], excludedCount: 2 });

    expect(screen.getByTestId('shared-link-excluded-notice')).toBeInTheDocument();
    expect(screen.queryByTestId('shared-link-contributed-warning')).not.toBeInTheDocument();
  });
});
