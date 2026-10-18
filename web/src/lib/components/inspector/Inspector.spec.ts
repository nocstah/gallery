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
  // the timeline's months: none in other years unless a test gives them
  sdkMock.getTimeBuckets.mockResolvedValue([{ timeBucket: '2009-03-01', count: 1 }]);
  sdkMock.getTimeBucketCovers.mockResolvedValue([]);
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
    // nor any years where no other year has photos then
    await waitFor(() => expect(sdkMock.getTimeBuckets).toHaveBeenCalled());
    expect(screen.queryByTestId('inspector-years')).not.toBeInTheDocument();
  });

  it('fills a day with no other photo with that day across the years, and shows a year here', async () => {
    const year2015 = assetFactory.build({
      ...asset,
      id: 'c6a6a3a6-5b1e-4c55-9d43-7f1f2b0a2015',
      originalFileName: 'IMG_2015.JPG',
      localDateTime: '2015-03-15T10:00:00.000Z',
      exifInfo: { ...asset.exifInfo, dateTimeOriginal: '2015-03-15T03:00:00.000Z' },
    });
    sdkMock.getAssetInfo.mockImplementation(({ id }) =>
      Promise.resolve(id === year2015.id ? year2015 : { ...asset, id }),
    );
    sdkMock.getTimeBuckets.mockResolvedValue([
      { timeBucket: '2015-03-01', count: 40 },
      { timeBucket: '2009-03-01', count: 1 },
      { timeBucket: '2004-03-01', count: 7 },
      { timeBucket: '2004-01-01', count: 3 },
    ]);
    const cover = (timeBucket: string, id: string) => ({
      timeBucket,
      representativeAssetId: id,
      representativeThumbhash: null,
      representativeRatio: 1,
    });
    sdkMock.getTimeBucketCovers.mockResolvedValue([
      cover('2015-03-15', year2015.id),
      cover('2004-03-12', 'photo-2004'),
    ]);
    render(Inspector, {});
    await pointAtThePhoto();

    const years = await screen.findByTestId('inspector-years');
    // the seven days around 14 March in the other years whose March holds photos, one request
    expect(sdkMock.getTimeBucketCovers).toHaveBeenCalledWith(
      expect.objectContaining({
        bucketSize: TimeBucketSize.Day,
        userId: 'owner',
        visibility: AssetVisibility.Timeline,
        timeBuckets: [
          ...['11', '12', '13', '14', '15', '16', '17'].map((day) => `2015-03-${day}`),
          ...['11', '12', '13', '14', '15', '16', '17'].map((day) => `2004-03-${day}`),
        ],
      }),
      expect.objectContaining({ signal: expect.anything() }),
    );
    // the newest year first, the day's own among them, marked
    const tiles = [...years.querySelectorAll('button')];
    expect(tiles.map((tile) => tile.textContent?.trim().slice(0, 4))).toEqual(['2015', '2009', '2004']);
    expect(tiles[1]).toHaveAttribute('aria-current', 'true');

    // a year's photo shows here, and the years stay with it marked; the day's own year is the way back
    await fireEvent.click(tiles[0]);
    expect(await screen.findByText('IMG_2015.JPG')).toBeInTheDocument();
    const after = [...screen.getByTestId('inspector-years').querySelectorAll('button')];
    expect(after[0]).toHaveAttribute('aria-current', 'true');
    expect(navigate).not.toHaveBeenCalled();
    await fireEvent.click(after[1]);
    expect(await screen.findByText('IMG_0001.JPG')).toBeInTheDocument();
    // the months were asked once
    expect(sdkMock.getTimeBuckets).toHaveBeenCalledTimes(1);
  });

  it('says quietly when the day could not be loaded, and tries again', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    sdkMock.getTimeBucket.mockRejectedValueOnce(new Error('offline'));
    render(Inspector, {});
    await pointAtThePhoto();

    expect(await screen.findByText('inspector_day_failed')).toBeInTheDocument();
    sdkMock.getTimeBucket.mockResolvedValue(
      dayBucket([later.id, asset.id], ['2009-03-14T09:05:00.000Z', '2009-03-14T07:32:05.000Z']),
    );
    await fireEvent.click(screen.getByRole('button', { name: 'retry' }));
    expect(await screen.findByTestId('inspector-day')).toBeInTheDocument();
    expect(screen.queryByText('inspector_day_failed')).not.toBeInTheDocument();
    warn.mockRestore();
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
