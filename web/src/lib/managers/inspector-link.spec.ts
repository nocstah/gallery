import {
  InspectorFeed,
  InspectorFollower,
  isGalleryPath,
  subjectOfTimelineAsset,
  type InspectorMessage,
  type InspectorSubject,
} from '$lib/managers/inspector-link.svelte';
import { timelineAssetFactory } from '@test-data/factories/asset-factory';

// Local Omarchy layer: the main window and the inspector window, each with its own BroadcastChannel on one name, as two
// windows of one browser profile have.
const timing = { settleMs: 20, heartbeatMs: 1000, aliveMs: 300, ackMs: 80 };
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

let name = '';
let opened: { close: () => void }[] = [];
const channel = () => {
  const made = new BroadcastChannel(name);
  opened.push(made);
  return made;
};
/** everything said on the channel, as a third window would hear it */
const listen = () => {
  const heard: InspectorMessage[] = [];
  channel().addEventListener('message', (event) => {
    heard.push((event as MessageEvent<InspectorMessage>).data);
  });
  return heard;
};

let feeds: InspectorFeed[] = [];
let followers: InspectorFollower[] = [];

type FeedOptions = Parameters<InspectorFeed['start']>[0];
const mainWindow = (options: FeedOptions = {}) => {
  const feed = new InspectorFeed();
  feed.start({ channel, timing, ...options });
  feeds.push(feed);
  return feed;
};
const inspectorWindow = (onClose = vi.fn()) => {
  const follower = new InspectorFollower();
  follower.start({ channel, timing, onClose });
  followers.push(follower);
  return follower;
};

const shownId = (follower: InspectorFollower) => follower.latest?.pick.subject.id;

beforeEach(() => {
  name = `inspector-test-${Math.random()}`;
});

afterEach(() => {
  for (const follower of followers) {
    follower.stop();
  }
  for (const feed of feeds) {
    feed.stop();
  }
  for (const made of opened) {
    made.close();
  }
  feeds = [];
  followers = [];
  opened = [];
});

describe('the inspector link', () => {
  it('says nothing while no inspector listens, and remembers the photo for the one that opens', async () => {
    const heard = listen();
    const feed = mainWindow();
    const photo = timelineAssetFactory.build();

    feed.point(photo);
    await pause(timing.settleMs * 3);
    expect(heard).toEqual([]);
    expect(feed.listening).toBe(false);

    const inspector = inspectorWindow();
    await vi.waitFor(() => expect(shownId(inspector)).toBe(photo.id));
    expect(feed.listening).toBe(true);
    expect(inspector.latest?.pick.kind).toBe('pointer');
  });

  it('tells the photo the pointer rested on, never one it only passed over', async () => {
    const feed = mainWindow();
    const inspector = inspectorWindow();
    await vi.waitFor(() => expect(feed.listening).toBe(true));
    const heard = listen();
    const [passed, left, rested] = timelineAssetFactory.buildList(3);

    feed.point(passed);
    feed.unpoint(passed.id);
    feed.point(left);
    feed.unpoint(left.id);
    feed.point(rested);
    await vi.waitFor(() => expect(shownId(inspector)).toBe(rested.id));
    await pause(timing.settleMs * 3);

    const said = heard.filter((message) => message.type === 'state');
    expect(said).toHaveLength(1);
    // the pointer leaving for nothing keeps the photo
    feed.unpoint(rested.id);
    await pause(timing.settleMs * 3);
    expect(shownId(inspector)).toBe(rested.id);
  });

  it('holds the selection (its last photo and the count) and the open photo over the pointer', async () => {
    let viewer: InspectorSubject | undefined;
    let selection: { subject: InspectorSubject; count: number } | undefined;
    const feed = mainWindow({ viewer: () => viewer, selection: () => selection });
    const inspector = inspectorWindow();
    await vi.waitFor(() => expect(feed.listening).toBe(true));
    const [pointed, selected, other, opened] = timelineAssetFactory.buildList(4);

    feed.point(pointed);
    await vi.waitFor(() => expect(shownId(inspector)).toBe(pointed.id));

    selection = { subject: subjectOfTimelineAsset(selected), count: 3 };
    feed.changed();
    await vi.waitFor(() => expect(inspector.latest?.pick).toMatchObject({ kind: 'selection', count: 3 }));
    expect(shownId(inspector)).toBe(selected.id);

    feed.point(other);
    await pause(timing.settleMs * 3);
    expect(shownId(inspector)).toBe(selected.id);

    viewer = subjectOfTimelineAsset(opened);
    feed.changed();
    await vi.waitFor(() => expect(inspector.latest?.pick.kind).toBe('viewer'));
    expect(shownId(inspector)).toBe(opened.id);

    // the viewer closes and the selection is cleared: the photo the viewer showed stays
    viewer = undefined;
    selection = undefined;
    feed.changed();
    await vi.waitFor(() => expect(inspector.latest?.pick.kind).toBe('pointer'));
    expect(shownId(inspector)).toBe(opened.id);
  });

  it('follows the window used last when two main windows are open', async () => {
    const first = mainWindow();
    const second = mainWindow();
    const inspector = inspectorWindow();
    await vi.waitFor(() => expect(first.listening && second.listening).toBe(true));
    const [one, two, three] = timelineAssetFactory.buildList(3);

    first.point(one);
    await vi.waitFor(() => expect(shownId(inspector)).toBe(one.id));
    second.point(two);
    await vi.waitFor(() => expect(shownId(inspector)).toBe(two.id));
    first.point(three);
    await vi.waitFor(() => expect(shownId(inspector)).toBe(three.id));
    expect(inspector.latest?.source).toBe(first.source);
  });

  it('asks the main window that said the photo to go to a page, and only that one', async () => {
    const navigate = vi.fn();
    const elsewhere = vi.fn();
    const feed = mainWindow({ navigate });
    mainWindow({ navigate: elsewhere });
    const inspector = inspectorWindow();
    await vi.waitFor(() => expect(feed.listening).toBe(true));
    feed.point(timelineAssetFactory.build());
    await vi.waitFor(() => expect(inspector.latest?.source).toBe(feed.source));

    await expect(inspector.navigate('/albums/one')).resolves.toBe(true);
    expect(navigate).toHaveBeenCalledWith('/albums/one');
    expect(elsewhere).not.toHaveBeenCalled();

    // never another origin
    await expect(inspector.navigate('//elsewhere.test/albums')).resolves.toBe(false);
    expect(navigate).toHaveBeenCalledTimes(1);
  });

  it('falls back when no main window answers', async () => {
    const feed = mainWindow();
    const inspector = inspectorWindow();
    await vi.waitFor(() => expect(feed.listening).toBe(true));
    feed.point(timelineAssetFactory.build());
    await vi.waitFor(() => expect(inspector.latest).toBeDefined());

    feed.stop();
    await expect(inspector.navigate('/albums/one')).resolves.toBe(false);
  });

  it('closes the inspector, and stops talking once it is gone', async () => {
    const onClose = vi.fn();
    const feed = mainWindow();
    const inspector = inspectorWindow(onClose);
    await vi.waitFor(() => expect(feed.isInspectorOpen()).toBe(true));

    feed.toggle();
    await vi.waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(feed.listening).toBe(false);

    // an inspector that says bye is forgotten at once
    inspector.stop();
    const again = inspectorWindow();
    await vi.waitFor(() => expect(feed.listening).toBe(true));
    again.stop();
    await vi.waitFor(() => expect(feed.listening).toBe(false));
  });

  it('forgets an inspector it has not heard from', async () => {
    const feed = mainWindow();
    // a window that crashed said hello once and then nothing, not even bye
    channel().postMessage({ type: 'hello', inspector: 'gone' } satisfies InspectorMessage);
    await vi.waitFor(() => expect(feed.listening).toBe(true));

    await pause(timing.aliveMs + 50);
    feed.point(timelineAssetFactory.build());
    await pause(timing.settleMs * 3);
    expect(feed.listening).toBe(false);
    expect(feed.isInspectorOpen()).toBe(false);
  });

  it('opens the inspector as a popup named for it, telling it which window opened it', () => {
    const open = vi.spyOn(globalThis, 'open').mockReturnValue(null);
    const feed = mainWindow();

    feed.toggle();
    expect(open).toHaveBeenCalledWith(
      `/inspector?from=${encodeURIComponent(feed.source)}`,
      'gallery-inspector',
      expect.stringContaining('popup'),
    );
    open.mockRestore();
  });

  it('only goes to paths inside Gallery', () => {
    expect(isGalleryPath('/albums/1')).toBe(true);
    expect(isGalleryPath('//evil.test/x')).toBe(false);
    expect(isGalleryPath(String.raw`/\evil.test`)).toBe(false);
    expect(isGalleryPath('javascript:alert(1)')).toBe(false);
    expect(isGalleryPath('https://evil.test/')).toBe(false);
  });
});
