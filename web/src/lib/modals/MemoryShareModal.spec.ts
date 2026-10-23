import { AssetTypeEnum, SharedLinkType, type SharedLinkResponseDto } from '@immich/sdk';
import { modalManager } from '@immich/ui';
import '@testing-library/jest-dom';
import { cleanup, render, screen, waitFor, within } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { init, register, waitLocale } from 'svelte-i18n';
import { getAnimateMock } from '$lib/__mocks__/animate.mock';
import '$lib/__mocks__/sdk.mock';
import { sdkMock } from '$lib/__mocks__/sdk.mock';
import { buildFilmPlan } from '$lib/components/memories/film/film-plan';
import type { MemoryPresentation } from '$lib/components/memories/memory-sharing';
import { assetFactory } from '@test-data/factories/asset-factory';
import { sharedLinkFactory } from '@test-data/factories/shared-link-factory';
import MemoryShareModal from './MemoryShareModal.svelte';

const { makeSharedLink, prepare, save, shareMemory, keepFilm } = vi.hoisted(() => ({
  makeSharedLink: vi.fn(),
  prepare: vi.fn(),
  save: vi.fn(),
  shareMemory: vi.fn(),
  keepFilm: vi.fn(),
}));
vi.mock('@immich/ui', async (importOriginal) => {
  const original = await importOriginal<typeof import('@immich/ui')>();
  return { ...original, modalManager: { show: vi.fn(), showDialog: vi.fn() } };
});
vi.mock('$lib/managers/film-video-manager.svelte', () => ({
  filmVideos: { items: [], shareDialogOpen: false, prepare, save },
}));
vi.mock('$lib/utils/curator', () => ({ curator: { shareMemory, keepFilm }, FILM_MOST_SECONDS: 300 }));
vi.mock('$lib/utils', () => ({ copyToClipboard: vi.fn() }));
vi.mock('$lib/managers/server-config-manager.svelte', () => ({
  serverConfigManager: { value: { externalDomain: 'https://photos.example' } },
}));
vi.mock('$lib/services/shared-link.service', () => ({
  makeSharedLink,
  SHARE_LINK_DAYS: 30,
  handleUpdateSharedLink: vi.fn(),
  asUrl: ({ key }: { key: string }) => `https://photos.example/share/${key}`,
  getSharedLinkActions: () => ({
    Copy: { title: 'Copy link', onAction: vi.fn() },
    Delete: { title: 'Delete link', onAction: vi.fn() },
  }),
}));

// the sheet's dates are worked out from now: a fixed now, so "30 days" is a known day
const NOW = new Date('2026-10-21T12:00:00.000Z');

const presentation: MemoryPresentation = {
  assetIds: ['a', 'b'],
  name: 'Riverton',
  title: 'Riverton · October 2023',
  line: 'October 2023',
  cover: 'a',
  focus: {},
  story: 'Together by the sea.',
  storyCues: [],
  trackIds: ['song'],
  photoSeconds: 5,
  language: 'en',
};
const getVideo = vi.fn((aspect: number) => ({
  memoryId: 'memory',
  plan: buildFilmPlan({
    memoryId: 'memory',
    assets: [{ id: 'a', kind: 'photo', ratio: 4 / 3 }],
    aspect,
    title: { text: 'Riverton', line: 'October 2023' },
    tracks: [],
  }),
}));

const open = (initialMode: 'memory' | 'portrait' | 'landscape' = 'memory', shown = presentation) =>
  render(MemoryShareModal, { memoryId: 'memory', presentation: shown, getVideo, initialMode, onClose: vi.fn() });
/** the choices, once the sheet has looked for a link already open */
const choose = async (initialMode: 'memory' | 'portrait' | 'landscape' = 'memory', shown = presentation) => {
  open(initialMode, shown);
  await screen.findByRole('button', { name: 'Make a link' });
};
const scope = () => screen.getByTestId('memory-share-scope').textContent?.replaceAll(/\s+/g, ' ').trim();

/** a link as Gallery answers it */
const madeLink = (overrides: Partial<SharedLinkResponseDto> = {}) =>
  sharedLinkFactory.build({
    id: 'link',
    key: 'key',
    type: SharedLinkType.Individual,
    description: presentation.title,
    password: null,
    expiresAt: '2026-11-20T12:00:00.000Z',
    createdAt: '2026-10-21T12:00:00.000Z',
    ...overrides,
  });

beforeAll(async () => {
  await init({ fallbackLocale: 'en-US' });
  register('en-US', () => import('$i18n/en.json'));
  await waitLocale('en-US');
});
beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers({ toFake: ['Date'], now: NOW });
  Element.prototype.animate = getAnimateMock();
  getVideo.mockImplementation((aspect: number) => ({
    memoryId: 'memory',
    plan: buildFilmPlan({
      memoryId: 'memory',
      assets: [{ id: 'a', kind: 'photo', ratio: 4 / 3 }],
      aspect,
      title: { text: 'Riverton', line: 'October 2023' },
      tracks: [],
    }),
  }));
  sdkMock.getAllSharedLinks.mockResolvedValue([]);
  makeSharedLink.mockImplementation((dto) =>
    Promise.resolve(madeLink({ password: dto.password ?? null, expiresAt: dto.expiresAt ?? null })),
  );
  prepare.mockResolvedValue({ jobId: 41, status: 'ready' });
  keepFilm.mockResolvedValue({ assetId: 'export' });
  shareMemory.mockResolvedValue({ ready: true, count: 2 });
  vi.mocked(modalManager.showDialog).mockResolvedValue(true);
  sdkMock.removeSharedLink.mockResolvedValue(undefined as never);
});
// `Modal` mounts a bits-ui dialog whose body scroll lock releases on a 24ms timer
afterEach(async () => {
  cleanup();
  vi.useRealTimers();
  await new Promise((resolve) => setTimeout(resolve, 30));
});

describe('what a link shares, in one sentence', () => {
  it('says who, what and until when, with 30 days chosen', async () => {
    await choose();

    expect(scope()).toBe(
      "Anyone with the link can watch this memory's 2 photos and its music as a film, without an account, until Nov 20, 2026.",
    );
    expect(screen.getByRole('radio', { name: '30 days' })).toBeChecked();
    expect(screen.getByRole('radio', { name: /Playable memory/ })).toBeChecked();
  });

  it('follows the expiry chosen, and says a link with no end lasts until it is turned off', async () => {
    await choose();

    await userEvent.click(screen.getByRole('radio', { name: '7 days' }));
    expect(scope()).toMatch(/, until Oct 28, 2026\.$/);
    await userEvent.click(screen.getByRole('radio', { name: '1 year' }));
    expect(scope()).toMatch(/, until Oct 21, 2027\.$/);
    await userEvent.click(screen.getByRole('radio', { name: 'Never' }));
    expect(scope()).toMatch(/, without an account, until you turn it off\.$/);
  });

  it('leaves the music out when the film has none', async () => {
    await choose('memory', { ...presentation, assetIds: ['a'], trackIds: [] });

    expect(scope()).toBe(
      "Anyone with the link can watch this memory's 1 photo as a film, without an account, until Nov 20, 2026.",
    );
  });

  it('says a video format shares one file anyone can download, and what Download does instead', async () => {
    await choose();

    await userEvent.click(screen.getByRole('radio', { name: /Portrait video/ }));

    expect(scope()).toBe(
      'Anyone with the link can watch and download this memory as one video file, without an account, until Nov 20, 2026.',
    );
    expect(screen.getByText('Download MP4 saves the video here and shares nothing.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Download MP4' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /A video file · 9:16/ })).toBeChecked();
  });

  it('says plainly which format is a link and which a file', async () => {
    await choose();

    expect(screen.getByRole('radio', { name: /Playable memory.*A link that plays as a film/ })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /Landscape video.*A video file · 16:9/ })).toBeInTheDocument();
  });

  it('says a film too long to save before anything is pressed', async () => {
    getVideo.mockImplementation((aspect: number) => {
      const plan = buildFilmPlan({
        memoryId: 'memory',
        assets: [{ id: 'a', kind: 'photo', ratio: 4 / 3 }],
        aspect,
        title: { text: 'Riverton', line: 'October 2023' },
        tracks: [],
      });
      return { memoryId: 'memory', plan: { ...plan, duration: 301 } };
    });
    await choose('landscape');

    expect(screen.getByText("Films over 5 minutes can't be saved as video yet")).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Make a link' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Download MP4' })).toBeDisabled();
  });
});

describe('a password', () => {
  it('is off until switched on, and is said only once one is typed', async () => {
    await choose();
    expect(screen.queryByLabelText('Password')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('switch', { name: 'Add a password' }));
    expect(scope()).toMatch(/^Anyone with the link can watch/);
    await userEvent.type(screen.getByLabelText('Password'), 'kept');

    expect(scope()).toMatch(/^Anyone with the link and its password can watch/);
  });

  it('asks for one before a link is made with the switch on', async () => {
    await choose();

    await userEvent.click(screen.getByRole('switch', { name: 'Add a password' }));
    await userEvent.click(screen.getByRole('button', { name: 'Make a link' }));

    expect(screen.getByRole('alert')).toHaveTextContent('Type a password, or turn off Add a password.');
    expect(makeSharedLink).not.toHaveBeenCalled();
  });

  it('goes with the link only while the switch is on', async () => {
    await choose();
    await userEvent.click(screen.getByRole('switch', { name: 'Add a password' }));
    await userEvent.type(screen.getByLabelText('Password'), 'kept');
    await userEvent.click(screen.getByRole('switch', { name: 'Add a password' }));

    await userEvent.click(screen.getByRole('button', { name: 'Make a link' }));

    await screen.findByText('Your link is ready.');
    expect(makeSharedLink.mock.calls[0][0].password).toBeUndefined();
    expect(scope()).not.toMatch(/password/);
  });
});

describe('making the link', () => {
  it('makes a playable link of the memory’s photos and has Curator set its film up, without a video', async () => {
    await choose();

    await userEvent.click(screen.getByRole('button', { name: 'Make a link' }));

    await screen.findByText('Your link is ready.');
    expect(makeSharedLink).toHaveBeenCalledWith(
      {
        type: SharedLinkType.Individual,
        assetIds: ['a', 'b'],
        description: 'Riverton · October 2023',
        expiresAt: '2026-11-20T12:00:00.000Z',
        password: undefined,
        allowUpload: false,
        allowDownload: false,
        showMetadata: false,
      },
      { rethrow: true },
    );
    expect(shareMemory).toHaveBeenCalledWith('memory', { linkId: 'link', key: 'key', presentation });
    expect(prepare).not.toHaveBeenCalled();
  });

  it('words the receipt from the link Gallery made and the photos Curator plays', async () => {
    makeSharedLink.mockResolvedValue(madeLink({ password: 'kept', expiresAt: null }));
    shareMemory.mockResolvedValue({ ready: true, count: 1 });
    await choose();

    await userEvent.click(screen.getByRole('button', { name: 'Make a link' }));

    await screen.findByText('Your link is ready.');
    expect(scope()).toBe(
      "Your link is ready. Anyone with the link and its password can watch this memory's 1 photo and its music as a film, without an account, until you turn it off.",
    );
    expect(screen.getByTestId('share-link-url')).toHaveTextContent('https://photos.example/share/key');
    expect(screen.getByRole('button', { name: 'Copy link' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit link' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Turn off' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Delete link' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open shared memory' })).toHaveAttribute(
      'href',
      'https://photos.example/share/key',
    );
  });

  it('never says a password the link does not have', async () => {
    await choose();

    await userEvent.click(screen.getByRole('button', { name: 'Make a link' }));

    await screen.findByText('Your link is ready.');
    expect(scope()).toBe(
      "Your link is ready. Anyone with the link can watch this memory's 2 photos and its music as a film, without an account, until Nov 20, 2026.",
    );
  });

  it.each([
    ['portrait', 0.5625],
    ['landscape', 1.7778],
  ] as const)('prepares a %s MP4 without publishing on Download', async (mode, aspect) => {
    await choose(mode);

    await userEvent.click(screen.getByRole('button', { name: 'Download MP4' }));

    await waitFor(() => expect(save).toHaveBeenCalled());
    expect(prepare.mock.calls[0][0]).toMatchObject({ size: '720p', plan: { aspect } });
    expect(keepFilm).not.toHaveBeenCalled();
    expect(makeSharedLink).not.toHaveBeenCalled();
  });

  it('shares the finished MP4 with downloads on', async () => {
    await choose('portrait');

    await userEvent.click(screen.getByRole('button', { name: 'Make a link' }));

    await screen.findByText('Your link is ready.');
    expect(keepFilm).toHaveBeenCalledWith(41);
    expect(makeSharedLink).toHaveBeenCalledWith(
      expect.objectContaining({ assetIds: ['export'], allowDownload: true }),
      { rethrow: true },
    );
    expect(shareMemory).not.toHaveBeenCalled();
    expect(scope()).toBe(
      'Your link is ready. Anyone with the link can watch and download this memory as one video file, without an account, until Nov 20, 2026.',
    );
  });

  it('opens Save as video on the choices, without looking for a link', async () => {
    await choose('portrait');

    expect(sdkMock.getAllSharedLinks).not.toHaveBeenCalled();
  });
});

describe('a link that fails says which step failed', () => {
  it('the video, with Curator’s reason, and makes no link', async () => {
    prepare.mockRejectedValue(new Error('The film could not be saved: no frames'));
    await choose('portrait');

    await userEvent.click(screen.getByRole('button', { name: 'Make a link' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent("The video couldn't be made.");
    expect(alert).toHaveTextContent('The film could not be saved: no frames');
    expect(makeSharedLink).not.toHaveBeenCalled();
  });

  it('keeping the video to share', async () => {
    keepFilm.mockRejectedValue(new Error('This saved video has expired; make it again'));
    await choose('landscape');

    await userEvent.click(screen.getByRole('button', { name: 'Make a link' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent("Gallery couldn't keep a copy of the video to share.");
    expect(alert).toHaveTextContent('This saved video has expired; make it again');
    expect(makeSharedLink).not.toHaveBeenCalled();
  });

  it('Gallery’s link', async () => {
    makeSharedLink.mockRejectedValue(new Error('Gallery did not answer'));
    await choose();

    await userEvent.click(screen.getByRole('button', { name: 'Make a link' }));

    expect(await screen.findByRole('alert')).toHaveTextContent("Gallery couldn't make the link.");
    expect(shareMemory).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Make a link' })).toBeEnabled();
  });

  it('Curator’s film for the link: trying again never makes a second public link', async () => {
    shareMemory.mockRejectedValueOnce(new Error('A song in this memory is no longer available'));
    await choose();

    await userEvent.click(screen.getByRole('button', { name: 'Make a link' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent("Gallery made the link, but Curator couldn't set up the film for it.");
    expect(alert).toHaveTextContent('A song in this memory is no longer available');
    expect(screen.getByRole('radio', { name: /Playable memory/ })).toBeDisabled();

    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));

    await screen.findByText('Your link is ready.');
    expect(makeSharedLink).toHaveBeenCalledOnce();
    expect(shareMemory).toHaveBeenCalledTimes(2);
  });

  it('Curator’s film for the link: the half-made link can be turned off', async () => {
    shareMemory.mockRejectedValue(new Error('Curator is not answering'));
    await choose();
    await userEvent.click(screen.getByRole('button', { name: 'Make a link' }));
    await screen.findByRole('alert');

    await userEvent.click(screen.getByRole('button', { name: 'Turn off' }));

    await screen.findByText('The link is off.');
    expect(sdkMock.removeSharedLink).toHaveBeenCalledWith({ id: 'link' });
  });
});

describe('turning it off', () => {
  const shared = async () => {
    await choose();
    await userEvent.click(screen.getByRole('button', { name: 'Make a link' }));
    await screen.findByText('Your link is ready.');
  };

  it('asks in its own words, deletes the link and says it is off', async () => {
    await shared();

    await userEvent.click(screen.getByRole('button', { name: 'Turn off' }));

    expect(modalManager.showDialog).toHaveBeenCalledWith({
      title: 'Turn off this link?',
      prompt: 'Anyone who has it can no longer open this memory. A new link would have a new address.',
      confirmText: 'Turn off',
    });
    await screen.findByText('The link is off.');
    expect(sdkMock.removeSharedLink).toHaveBeenCalledWith({ id: 'link' });
    expect(scope()).toBe('The link is off. Anyone who has it can no longer open this memory.');
    expect(screen.queryByTestId('share-link')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Make a link' }));
    expect(screen.getByRole('radio', { name: /Playable memory/ })).toBeEnabled();
  });

  it('leaves the link on when the question is declined', async () => {
    vi.mocked(modalManager.showDialog).mockResolvedValue(false);
    await shared();

    await userEvent.click(screen.getByRole('button', { name: 'Turn off' }));

    expect(sdkMock.removeSharedLink).not.toHaveBeenCalled();
    expect(screen.getByText('Your link is ready.')).toBeInTheDocument();
  });

  it('says so when Gallery could not turn it off', async () => {
    sdkMock.removeSharedLink.mockRejectedValue(new Error('Gallery did not answer'));
    await shared();

    await userEvent.click(screen.getByRole('button', { name: 'Turn off' }));

    expect(await screen.findByRole('alert')).toHaveTextContent("Gallery couldn't turn the link off.");
    expect(screen.getByTestId('share-link')).toBeInTheDocument();
  });
});

describe('a memory already shared', () => {
  const photo = (id: string, checksum = id) => assetFactory.build({ id, checksum, type: AssetTypeEnum.Image });

  it('opens on its live link, with what it shares and Turn off', async () => {
    const live = madeLink({ id: 'live', key: 'live-key', password: 'kept', assets: [photo('a')] });
    sdkMock.getAllSharedLinks.mockResolvedValue([
      madeLink({ id: 'other', description: 'Somewhere else · May 2020', assets: [photo('a')] }),
      madeLink({ id: 'ended', assets: [photo('a')], expiresAt: '2026-10-01T00:00:00.000Z' }),
      live,
    ]);
    // the list holds a link's first photo; the link itself holds them all (two copies of one photo play once)
    sdkMock.getSharedLinkById.mockResolvedValue({ ...live, assets: [photo('a'), photo('b'), photo('c', 'b')] });
    open();

    await screen.findByText('This memory is shared.');
    expect(sdkMock.getSharedLinkById).toHaveBeenCalledWith({ id: 'live' });
    expect(scope()).toBe(
      "This memory is shared. Anyone with the link and its password can watch this memory's 2 photos as a film, without an account, until Nov 20, 2026.",
    );
    expect(screen.getByTestId('share-link-url')).toHaveTextContent('https://photos.example/share/live-key');
    expect(screen.getByRole('button', { name: 'Turn off' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Make a link' })).not.toBeInTheDocument();
  });

  it('finds a video file made of it, and says how many more links are on', async () => {
    const film = assetFactory.build({
      id: 'film',
      type: AssetTypeEnum.Video,
      originalFileName: 'Riverton · October 2023 · Portrait video.mp4',
    });
    sdkMock.getAllSharedLinks.mockResolvedValue([
      madeLink({ id: 'older', assets: [photo('b')], createdAt: '2026-10-01T00:00:00.000Z' }),
      madeLink({ id: 'video', assets: [film], createdAt: '2026-10-20T00:00:00.000Z' }),
    ]);
    open();

    await screen.findByText('This memory is shared.');
    expect(scope()).toMatch(/can watch and download this memory as one video file/);
    expect(sdkMock.getSharedLinkById).not.toHaveBeenCalled();
    expect(screen.getByText('1 more link to this memory is on.')).toBeInTheDocument();
  });

  it('offers the choices again to share another way, the live link staying on', async () => {
    sdkMock.getAllSharedLinks.mockResolvedValue([madeLink({ assets: [photo('a')] })]);
    sdkMock.getSharedLinkById.mockResolvedValue(madeLink({ assets: [photo('a'), photo('b')] }));
    open();
    await screen.findByText('This memory is shared.');

    await userEvent.click(screen.getByRole('button', { name: 'Share another way' }));

    expect(screen.getByRole('button', { name: 'Make a link' })).toBeEnabled();
    expect(sdkMock.removeSharedLink).not.toHaveBeenCalled();
  });

  it('opens on the choices when Gallery cannot list the links', async () => {
    sdkMock.getAllSharedLinks.mockRejectedValue(new Error('offline'));
    open();

    expect(await screen.findByRole('button', { name: 'Make a link' })).toBeInTheDocument();
    expect(within(screen.getByTestId('memory-share')).queryByRole('alert')).not.toBeInTheDocument();
  });
});
