import { ScreenAwake } from './room-awake';

type FakeLock = { released: boolean; release: ReturnType<typeof vi.fn> };

const lockApi = (refuse = false) => {
  const locks: FakeLock[] = [];
  const request = vi.fn(() => {
    if (refuse) {
      return Promise.reject(new DOMException('not allowed', 'NotAllowedError'));
    }
    const lock: FakeLock = {
      released: false,
      release: vi.fn(() => {
        lock.released = true;
        return Promise.resolve();
      }),
    };
    locks.push(lock);
    return Promise.resolve(lock);
  });
  Object.defineProperty(navigator, 'wakeLock', { value: { request }, configurable: true });
  return { request, locks };
};

const setHidden = (hidden: boolean) => {
  Object.defineProperty(document, 'hidden', { value: hidden, configurable: true });
  document.dispatchEvent(new Event('visibilitychange'));
};

describe(ScreenAwake.name, () => {
  let awake: ScreenAwake;
  let play: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    awake = new ScreenAwake();
    play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(function (this: HTMLMediaElement) {
      Object.defineProperty(this, 'paused', { value: false, configurable: true });
      return Promise.resolve();
    });
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(function (this: HTMLMediaElement) {
      Object.defineProperty(this, 'paused', { value: true, configurable: true });
    });
  });

  afterEach(() => {
    awake.destroy();
    Reflect.deleteProperty(navigator, 'wakeLock');
    setHidden(false);
    vi.restoreAllMocks();
  });

  it('takes a screen wake lock where the browser has the API, and lets it go when released', async () => {
    const { request, locks } = lockApi();

    awake.hold();
    await vi.waitFor(() => expect(awake.mode).toBe('lock'));
    expect(request).toHaveBeenCalledWith('screen');
    expect(play).not.toHaveBeenCalled();

    awake.release();
    expect(locks[0].release).toHaveBeenCalledOnce();
    expect(awake.mode).toBe('none');
  });

  it('takes the lock again when the page is back, the browser having let it go while it was hidden', async () => {
    const { request, locks } = lockApi();
    awake.hold();
    await vi.waitFor(() => expect(awake.mode).toBe('lock'));

    // the browser releases a wake lock when the page is hidden
    locks[0].released = true;
    setHidden(true);
    setHidden(false);
    await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(2));
    expect(awake.mode).toBe('lock');
  });

  it('falls back to a silent looping video out of sight without the API', async () => {
    awake.hold();

    await vi.waitFor(() => expect(awake.mode).toBe('video'));
    const video = document.querySelector<HTMLVideoElement>('[data-testid="room-awake"]');
    expect(video?.muted).toBe(true);
    expect(video?.loop).toBe(true);
    expect(video?.getAttribute('aria-hidden')).toBe('true');

    awake.release();
    expect(awake.mode).toBe('none');
    awake.destroy();
    expect(document.querySelector('[data-testid="room-awake"]')).toBeNull();
  });

  it('falls back to the video when the lock is refused', async () => {
    lockApi(true);
    awake.hold();

    await vi.waitFor(() => expect(awake.mode).toBe('video'));
  });

  it('asks for nothing once released before the lock came', async () => {
    const { locks } = lockApi();
    awake.hold();
    awake.release();

    await vi.waitFor(() => expect(locks[0]?.release).toHaveBeenCalled());
    expect(awake.mode).toBe('none');
  });
});
