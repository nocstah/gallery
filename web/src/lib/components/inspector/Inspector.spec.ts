import { AssetTypeEnum, AssetVisibility, TimeBucketSize, type TimeBucketAssetResponseDto } from '@immich/sdk';
import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { sdkMock } from '$lib/__mocks__/sdk.mock';
import Inspector from '$lib/components/inspector/Inspector.svelte';
import { InspectorFeed } from '$lib/managers/inspector-link.svelte';
import { albumFactory } from '@test-data/factories/album-factory';
import { assetFactory, timelineAssetFactory } from '@test-data/factories/asset-factory';
import { personFactory } from '@test-data/factories/person-factory';

// Local Omarchy layer: the inspector window with a main window beside it (its feed on the same channel, as a second
// window of the profile has): pointing at a photo shows it with its details, and an album opens in the main window.
const mocks = vi.hoisted(() => ({
  owner: true,
  story: vi.fn(),
}));

vi.mock('$lib/managers/auth-manager.svelte', () => ({
  authManager: {
    authenticated: true,
    isSharedLink: false,
    params: {},
    get user() {
      return { id: 'owner', name: 'Owner', email: 'owner@example.com', isAdmin: mocks.owner };
    },
  },
}));
vi.mock('$lib/utils/curator', async (original) => ({
  ...(await original<typeof import('$lib/utils/curator')>()),
  curatorIsMine: () => mocks.owner,
  curator: { story: mocks.story },
}));

const asset = assetFactory.build({
  ownerId: 'owner',
  type: AssetTypeEnum.Image,
  thumbhash: null,
  width: 4032,
  height: 3024,
  originalFileName: 'IMG_0001.JPG',
  localDateTime: '2009-03-14T14:32:05.000Z',
  exifInfo: {
    dateTimeOriginal: '2009-03-14T07:32:05.000Z',
    timeZone: 'Asia/Bangkok',
    city: 'Riverton',
    country: 'Thailand',
    make: 'Canon',
    model: 'Canon EOS 5D',
    description: 'Two boats on a beach. (AI)',
  },
  people: [personFactory.build({ name: 'Ann', isHidden: false }), personFactory.build({ name: '', isHidden: false })],
});
const album = albumFactory.build({ albumName: 'Phuket', assetCount: 212 });
const later = assetFactory.build({
  ...asset,
  id: '6b8f2a52-3c1d-4e0f-9a7b-2d4c6e8f0a1b',
  originalFileName: 'IMG_0002.JPG',
  localDateTime: '2009-03-14T16:05:00.000Z',
});

/** the photo's day as the timeline sends it: newest first, in columns */
const dayBucket = (ids: string[], times: string[]) =>
  ({
    id: ids,
    ownerId: ids.map(() => 'owner'),
    ratio: ids.map(() => 4 / 3),
    thumbhash: ids.map(() => null),
    fileCreatedAt: times,
    localOffsetHours: ids.map(() => 7),
    createdAt: times,
    visibility: ids.map(() => AssetVisibility.Timeline),
    isFavorite: ids.map(() => false),
    isTrashed: ids.map(() => false),
    isImage: ids.map(() => true),
    duration: ids.map(() => null),
    projectionType: ids.map(() => null),
    livePhotoVideoId: ids.map(() => null),
    city: ids.map(() => 'Riverton'),
    country: ids.map(() => 'Thailand'),
  }) as unknown as TimeBucketAssetResponseDto;

let feed: InspectorFeed;
const navigate = vi.fn();

beforeEach(() => {
  mocks.owner = true;
  mocks.story.mockResolvedValue({ story: { text: 'A slow day by the sea.', model: 'text', written_at: '' } });
  sdkMock.getAssetInfo.mockImplementation(({ id }) => Promise.resolve(id === later.id ? later : { ...asset, id }));
  sdkMock.getTimeBucket.mockResolvedValue(dayBucket([asset.id], ['2009-03-14T07:32:05.000Z']));
  sdkMock.getAllAlbums.mockResolvedValue([album]);
  feed = new InspectorFeed();
  feed.start({ navigate, timing: { settleMs: 5, ackMs: 200 } });
});

afterEach(() => {
  feed.stop();
});

const pointAtThePhoto = async () => {
  await waitFor(() => expect(feed.listening).toBe(true));
  feed.point(timelineAssetFactory.build({ id: asset.id, thumbhash: null, ratio: 4 / 3, isVideo: false }));
  return screen.findByRole('heading', { level: 1 });
};

describe('Inspector', () => {
  it('waits quietly until a main window points at a photo', () => {
    render(Inspector, {});
    expect(screen.getByText('inspector_point_at_photo')).toBeInTheDocument();
    expect(sdkMock.getAssetInfo).not.toHaveBeenCalled();
  });

  it('shows the photo pointed at with when, where, who and the albums it is in', async () => {
    render(Inspector, {});
    const date = await pointAtThePhoto();

    expect(date).toHaveTextContent('2009');
    expect(sdkMock.getAssetInfo).toHaveBeenCalledWith(
      { id: asset.id },
      expect.objectContaining({ signal: expect.anything() }),
    );
    expect(screen.getByText(/GMT\+07:00/)).toBeInTheDocument();
    expect(screen.getByText('Riverton, Thailand')).toBeInTheDocument();
    expect(screen.getByText('Ann')).toBeInTheDocument();
    expect(screen.getByText('inspector_unnamed')).toBeInTheDocument();
    expect(screen.getByText('Canon EOS 5D')).toBeInTheDocument();
    expect(screen.getByText('IMG_0001.JPG')).toBeInTheDocument();
    const photo = screen.getByRole('img', { name: /./ });
    expect(photo.getAttribute('src')).toContain('size=preview');
    expect(photo.getAttribute('src')).not.toContain('original');
  });

  it('opens an album in the main window', async () => {
    render(Inspector, {});
    await pointAtThePhoto();

    await fireEvent.click(screen.getByRole('link', { name: /Phuket/ }));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith(`/albums/${album.id}`));
  });

  it("shows Curator's caption and story to Curator's owner", async () => {
    render(Inspector, {});
    await pointAtThePhoto();

    expect(screen.getByText('Two boats on a beach.')).toBeInTheDocument();
    expect(await screen.findByText('A slow day by the sea.')).toBeInTheDocument();
    expect(mocks.story).toHaveBeenCalledWith({ album: album.id });
  });

  it('asks Curator nothing for another account', async () => {
    mocks.owner = false;
    render(Inspector, {});
    await pointAtThePhoto();

    // the description is the photo's own (anyone who sees the photo sees it); the story is Curator's
    expect(screen.getByText('Two boats on a beach.')).toBeInTheDocument();
    expect(mocks.story).not.toHaveBeenCalled();
    expect(screen.queryByText('A slow day by the sea.')).not.toBeInTheDocument();
  });

  it('lays out the day around the photo, and shows one of them here, never in the main window', async () => {
    sdkMock.getTimeBucket.mockResolvedValue(
      dayBucket([later.id, asset.id], ['2009-03-14T09:05:00.000Z', '2009-03-14T07:32:05.000Z']),
    );
    render(Inspector, {});
    await pointAtThePhoto();

    const day = await screen.findByTestId('inspector-day');
    expect(sdkMock.getTimeBucket).toHaveBeenCalledWith(
      {
        timeBucket: '2009-03-14',
        bucketSize: TimeBucketSize.Day,
        userId: 'owner',
        visibility: AssetVisibility.Timeline,
        withStacked: true,
        withPartners: true,
        withSharedSpaces: true,
      },
      expect.objectContaining({ signal: expect.anything() }),
    );
    // in the order taken, the photo on screen marked
    const [first, second] = day.querySelectorAll('button');
    expect(first).toHaveAttribute('aria-current', 'true');
    expect(second).not.toHaveAttribute('aria-current');

    await fireEvent.click(second);
    expect(await screen.findByText('IMG_0002.JPG')).toBeInTheDocument();
    expect(screen.getByTestId('inspector-day').querySelectorAll('button')[1]).toHaveAttribute('aria-current', 'true');
    expect(navigate).not.toHaveBeenCalled();
    // the day was asked for once
    expect(sdkMock.getTimeBucket).toHaveBeenCalledTimes(1);

    // the main window pointing somewhere new takes the inspector back
    const elsewhere = timelineAssetFactory.build({ thumbhash: null, ratio: 4 / 3, isVideo: false });
    feed.point(elsewhere);
    await waitFor(() => expect(sdkMock.getAssetInfo).toHaveBeenLastCalledWith({ id: elsewhere.id }, expect.anything()));
    expect(await screen.findByText('IMG_0001.JPG')).toBeInTheDocument();
  });

  it('has no strip for a day with no other photo', async () => {
    render(Inspector, {});
    await pointAtThePhoto();
    await waitFor(() => expect(sdkMock.getTimeBucket).toHaveBeenCalled());
    expect(screen.queryByTestId('inspector-day')).not.toBeInTheDocument();
  });

  it('shows the count while a selection holds', async () => {
    const selected = timelineAssetFactory.build({ id: asset.id, thumbhash: null, isVideo: false });
    feed.stop();
    feed.start({
      navigate,
      timing: { settleMs: 5 },
      selection: () => ({ subject: { id: selected.id, thumbhash: null, ratio: 4 / 3, video: false }, count: 12 }),
    });
    render(Inspector, {});
    await waitFor(() => expect(feed.listening).toBe(true));
    feed.changed();

    expect(await screen.findByText('selected_count')).toBeInTheDocument();
  });

  it("leaves the search palette's keys to the main window, and closes on Shift+I", async () => {
    const close = vi.spyOn(globalThis, 'close').mockImplementation(() => {});
    const palette = vi.fn();
    document.addEventListener('keydown', palette);
    render(Inspector, {});

    await fireEvent.keyDown(document.body, { key: 'k', ctrlKey: true });
    await fireEvent.keyDown(document.body, { key: '/' });
    expect(palette).not.toHaveBeenCalled();
    await fireEvent.keyDown(document.body, { key: 'I', shiftKey: true });
    expect(close).toHaveBeenCalled();

    document.removeEventListener('keydown', palette);
    close.mockRestore();
  });

  it('starts on the photo it is given, without a main window', async () => {
    feed.stop();
    render(Inspector, { assetId: asset.id });
    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('2009');
  });
});
