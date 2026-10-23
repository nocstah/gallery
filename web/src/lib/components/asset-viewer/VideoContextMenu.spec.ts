import { AssetTypeEnum, AssetVisibility, type AssetResponseDto } from '@immich/sdk';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { addMessages, locale } from 'svelte-i18n';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { canShareVideo } from '$lib/utils/share-video';
import VideoContextMenu from './VideoContextMenu.test-wrapper.svelte';

const state = vi.hoisted(() => ({
  authenticated: true,
  isAdmin: true,
  shared: false,
  start: vi.fn(),
}));

vi.mock('$lib/managers/auth-manager.svelte', () => ({
  authManager: {
    get authenticated() {
      return state.authenticated;
    },
    get isSharedLink() {
      return state.shared;
    },
    get user() {
      return { id: 'me', isAdmin: state.isAdmin };
    },
  },
}));
vi.mock('$lib/utils/curator', () => ({ curatorIsMine: () => state.authenticated && state.isAdmin }));
vi.mock('$lib/managers/share-video-manager.svelte', () => ({ shareVideos: { start: state.start } }));
vi.mock('$lib/managers/language-manager.svelte', () => ({ languageManager: { rtl: false } }));

const asset = {
  id: 'video-1',
  ownerId: 'me',
  type: AssetTypeEnum.Video,
  visibility: AssetVisibility.Timeline,
  isTrashed: false,
  livePhotoVideoId: null,
  originalFileName: 'Test clip.mov',
} as AssetResponseDto;

const openMenu = async (options: MouseEventInit = {}) => {
  const video = screen.getByLabelText('Test video');
  video.focus();
  const event = new MouseEvent('contextmenu', {
    bubbles: true,
    cancelable: true,
    clientX: 100,
    clientY: 100,
    ...options,
  });
  await fireEvent(video, event);
  return event;
};

describe('video downloads from right-click', () => {
  beforeEach(async () => {
    state.authenticated = true;
    state.isAdmin = true;
    state.shared = false;
    state.start.mockReset();
    addMessages('en', { download: 'Download', download_for_app: 'Download for {app}' });
    await locale.set('en');
  });
  afterEach(cleanup);

  it('opens the menu on the player and downloads the right video for WhatsApp', async () => {
    render(VideoContextMenu, { asset });
    const event = await openMenu();
    expect(event.defaultPrevented).toBe(true);
    const menu = await screen.findByRole('menu', { name: 'Download' });
    await waitFor(() => expect(menu).toHaveFocus());
    await fireEvent.click(screen.getByRole('menuitem', { name: 'Download for WhatsApp' }));
    expect(state.start).toHaveBeenCalledExactlyOnceWith('video-1', 'whatsapp', 'Test clip.mov');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Test video')).toHaveFocus();
  });

  it('retains the browser menu with Shift and outside the player', async () => {
    render(VideoContextMenu, { asset });
    const event = await openMenu({ shiftKey: true });
    expect(event.defaultPrevented).toBe(false);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    await fireEvent.contextMenu(screen.getByRole('button'));
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('handles Escape without closing the viewer and keyboard selection without toggling playback', async () => {
    render(VideoContextMenu, { asset });
    await openMenu();
    const viewerShortcut = vi.fn();
    document.addEventListener('keydown', viewerShortcut);
    try {
      await fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
      expect(screen.queryByRole('menu')).not.toBeInTheDocument();
      expect(viewerShortcut).not.toHaveBeenCalled();
      await openMenu();
      await fireEvent.keyDown(screen.getByRole('menu'), { key: 'ArrowDown' });
      await fireEvent.keyDown(screen.getByRole('menu'), { key: 'Enter' });
      expect(state.start).toHaveBeenCalledWith('video-1', 'whatsapp', 'Test clip.mov');
      expect(viewerShortcut).not.toHaveBeenCalled();
    } finally {
      document.removeEventListener('keydown', viewerShortcut);
    }
  });

  it('dismisses the previous video menu when navigating', async () => {
    const { rerender } = render(VideoContextMenu, { asset });
    await openMenu();
    await rerender({ asset: { ...asset, id: 'video-2' } });
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    await openMenu();
    await fireEvent.click(screen.getByRole('menuitem', { name: 'Download for WhatsApp' }));
    expect(state.start).toHaveBeenCalledWith('video-2', 'whatsapp', 'Test clip.mov');
  });

  it('uses the Live Photo id so the service resolves its video half', async () => {
    render(VideoContextMenu, { asset: { ...asset, type: AssetTypeEnum.Image, livePhotoVideoId: 'motion-1' } });
    await openMenu();
    await fireEvent.click(screen.getByRole('menuitem', { name: 'Download for WhatsApp' }));
    expect(state.start).toHaveBeenCalledWith('video-1', 'whatsapp', 'Test clip.mov');
  });

  it.each([
    { ownerId: 'someone-else' },
    { isTrashed: true },
    { visibility: AssetVisibility.Locked },
    { type: AssetTypeEnum.Image, livePhotoVideoId: null },
  ])('does not intercept the browser menu for ineligible assets: %j', async (changes) => {
    render(VideoContextMenu, { asset: { ...asset, ...changes } });
    const event = await openMenu();
    expect(event.defaultPrevented).toBe(false);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it.each(['authenticated', 'isAdmin'] as const)('requires %s', (field) => {
    state[field] = false;
    expect(canShareVideo(asset)).toBe(false);
  });

  it('excludes shared links and supports timeline videos and Live Photos without a health check', () => {
    expect(canShareVideo({ ...asset, type: undefined, isVideo: true })).toBe(true);
    expect(canShareVideo({ ...asset, type: undefined, isVideo: false, livePhotoVideoId: 'motion-1' })).toBe(true);
    state.shared = true;
    expect(canShareVideo(asset)).toBe(false);
  });
});
