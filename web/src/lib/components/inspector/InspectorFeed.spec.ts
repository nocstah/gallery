import { fireEvent, render } from '@testing-library/svelte';
import InspectorFeed from '$lib/components/inspector/InspectorFeed.svelte';
import { INSPECTOR_CHANNEL, inspectorFeed, type InspectorMessage } from '$lib/managers/inspector-link.svelte';

// Local Omarchy layer: the main window's side of the inspector, as the user pages' layout mounts it.
const mocks = vi.hoisted(() => ({ authenticated: true, isSharedLink: false, phone: false, coarse: false }));

vi.mock('$app/navigation', () => ({ goto: vi.fn() }));
vi.mock('$lib/stores/media-query-manager.svelte', () => ({
  mediaQueryManager: {
    get isPhone() {
      return mocks.phone;
    },
    get pointerCoarse() {
      return mocks.coarse;
    },
    maxMd: false,
    isFullSidebar: true,
    reducedMotion: false,
    minLg: true,
  },
}));
vi.mock('$lib/managers/auth-manager.svelte', () => ({
  authManager: {
    get authenticated() {
      return mocks.authenticated;
    },
    get isSharedLink() {
      return mocks.isSharedLink;
    },
    params: {},
    user: { id: 'me', isAdmin: false },
  },
}));

let open: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  mocks.authenticated = true;
  mocks.isSharedLink = false;
  mocks.phone = false;
  mocks.coarse = false;
  open = vi.spyOn(globalThis, 'open').mockReturnValue(null);
});

afterEach(() => {
  open.mockRestore();
});

describe('InspectorFeed', () => {
  it('opens the inspector with Shift+I', async () => {
    render(InspectorFeed);
    await fireEvent.keyDown(document, { key: 'I', shiftKey: true });
    expect(open).toHaveBeenCalledWith(
      expect.stringMatching(/^\/inspector\?from=/),
      'gallery-inspector',
      expect.any(String),
    );
  });

  it('leaves a plain I to the viewer, and a field to its text', async () => {
    render(InspectorFeed);
    await fireEvent.keyDown(document, { key: 'i' });
    const field = document.createElement('input');
    field.type = 'text';
    document.body.append(field);
    await fireEvent.keyDown(field, { key: 'I', shiftKey: true });
    field.remove();
    expect(open).not.toHaveBeenCalled();
  });

  it('closes an open inspector with Shift+I again', async () => {
    render(InspectorFeed);
    const inspector = new BroadcastChannel(INSPECTOR_CHANNEL);
    const heard: InspectorMessage[] = [];
    inspector.addEventListener('message', (event) => {
      heard.push((event as MessageEvent<InspectorMessage>).data);
    });
    inspector.postMessage({ type: 'hello', inspector: 'one' } satisfies InspectorMessage);
    await vi.waitFor(() => expect(inspectorFeed.listening).toBe(true));

    await fireEvent.keyDown(document, { key: 'I', shiftKey: true });
    await vi.waitFor(() => expect(heard).toContainEqual({ type: 'close' }));
    expect(open).not.toHaveBeenCalled();
    inspector.close();
  });

  it('opens none where there is no second screen to put it on, and still closes one that is open', async () => {
    render(InspectorFeed);
    for (const [phone, coarse] of [
      [true, false],
      [false, true],
    ]) {
      mocks.phone = phone;
      mocks.coarse = coarse;
      await fireEvent.keyDown(document, { key: 'I', shiftKey: true });
    }
    expect(open).not.toHaveBeenCalled();

    // one opened from a wider window still closes from here
    const inspector = new BroadcastChannel(INSPECTOR_CHANNEL);
    const heard: InspectorMessage[] = [];
    inspector.addEventListener('message', (event) => {
      heard.push((event as MessageEvent<InspectorMessage>).data);
    });
    inspector.postMessage({ type: 'hello', inspector: 'two' } satisfies InspectorMessage);
    await vi.waitFor(() => expect(inspectorFeed.listening).toBe(true));
    await fireEvent.keyDown(document, { key: 'I', shiftKey: true });
    await vi.waitFor(() => expect(heard).toContainEqual({ type: 'close' }));
    inspector.close();
  });

  it('offers nothing on a shared link', async () => {
    mocks.isSharedLink = true;
    render(InspectorFeed);
    await fireEvent.keyDown(document, { key: 'I', shiftKey: true });
    expect(open).not.toHaveBeenCalled();
  });
});
