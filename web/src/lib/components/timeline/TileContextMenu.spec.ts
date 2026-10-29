import { AssetVisibility } from '@immich/sdk';
import { fireEvent, render, screen, cleanup } from '@testing-library/svelte';
import { addMessages, locale } from 'svelte-i18n';
import { afterEach, expect, it, vi } from 'vitest';
import { loadLibraryContext, resetLibraryContext } from '$lib/gallery/libraries/library-context.svelte';
import { timelineAssetFactory } from '@test-data/factories/asset-factory';
import { SECOND_CURATOR_FEATURES, secondOffering, serving } from '@test-data/factories/library-context-factory';
import TileContextMenu from './TileContextMenu.test-wrapper.svelte';

const { start } = vi.hoisted(() => ({ start: vi.fn() }));
vi.mock('$lib/managers/auth-manager.svelte', () => ({
  authManager: { authenticated: true, isSharedLink: false, user: { id: 'me', isAdmin: true } },
}));
vi.mock('$lib/utils/curator', () => ({ curatorIsMine: () => true }));
vi.mock('$lib/utils', () => ({ getAssetMediaUrl: () => '/test-thumbnail.png' }));
vi.mock('$lib/managers/share-video-manager.svelte', () => ({ shareVideos: { start } }));
vi.mock('$lib/managers/language-manager.svelte', () => ({ languageManager: { rtl: false } }));
vi.mock('$lib/managers/stack-expand-manager.svelte', () => ({ stackExpandManager: {} }));
vi.mock('$lib/managers/thumbnail-zoom-manager.svelte', () => ({ thumbnailZoomManager: {} }));
vi.mock('$lib/components/curator/stack-pick.svelte', () => ({ stackPick: {} }));
vi.mock('$lib/utils/copy-subject', () => ({ copySubject: vi.fn() }));
vi.mock('$lib/utils/reveal', () => ({ revealInPhotos: vi.fn() }));

afterEach(() => {
  cleanup();
  resetLibraryContext();
});

it.each([true, false])('does not offer external processing for locked assets (image: %s)', async (isImage) => {
  addMessages('en', { menu: 'Menu', copy_subject: 'Copy subject', download_for_app: 'Download for {app}' });
  await locale.set('en');
  const asset = timelineAssetFactory.build({
    id: 'private-asset',
    ownerId: 'me',
    visibility: AssetVisibility.Locked,
    isImage,
    isVideo: !isImage,
  });
  render(TileContextMenu, { assets: [asset] });
  await fireEvent.contextMenu(screen.getByRole('button', { name: asset.id }));
  await screen.findByRole('menu');
  expect(screen.queryByRole('menuitem', { name: 'Copy subject' })).not.toBeInTheDocument();
  expect(screen.queryByRole('menuitem', { name: /Download for/ })).not.toBeInTheDocument();
});

it('keeps subject copying available for an ordinary photo', async () => {
  addMessages('en', { menu: 'Menu', copy_subject: 'Copy subject' });
  await locale.set('en');
  const asset = timelineAssetFactory.build({ id: 'ordinary-photo', ownerId: 'me', isImage: true, isVideo: false });
  render(TileContextMenu, { assets: [asset] });
  await fireEvent.contextMenu(screen.getByRole('button', { name: asset.id }));
  expect(await screen.findByRole('menuitem', { name: 'Copy subject' })).toBeInTheDocument();
});

it('downloads the right-clicked video after MenuOption closes and clears the selection', async () => {
  addMessages('en', { menu: 'Menu', download_for_app: 'Download for {app}' });
  await locale.set('en');
  const asset = timelineAssetFactory.build({ id: 'selected-video', ownerId: 'me', isImage: false, isVideo: true });
  render(TileContextMenu, { assets: [asset] });
  await fireEvent.contextMenu(screen.getByRole('button', { name: asset.id }));
  await fireEvent.click(await screen.findByRole('menuitem', { name: 'Download for WhatsApp' }));
  expect(start).toHaveBeenCalledExactlyOnceWith(asset.id, 'whatsapp', expect.any(String));
  expect(screen.queryByRole('menu')).not.toBeInTheDocument();
});

// Local Omarchy layer: where this library's Curator has no live tools and makes no videos for chat apps
// (gallery/libraries), as the second library's, which only cleans up, neither is offered
it("offers neither subject copying nor a video for a chat app where this library's Curator offers neither", async () => {
  addMessages('en', { menu: 'Menu', copy_subject: 'Copy subject', download_for_app: 'Download for {app}' });
  await locale.set('en');
  await loadLibraryContext(serving(secondOffering(SECOND_CURATOR_FEATURES)));
  const photo = timelineAssetFactory.build({ id: 'a-photo', ownerId: 'me', isImage: true, isVideo: false });
  const clip = timelineAssetFactory.build({ id: 'a-video', ownerId: 'me', isImage: false, isVideo: true });

  render(TileContextMenu, { assets: [photo] });
  await fireEvent.contextMenu(screen.getByRole('button', { name: photo.id }));
  await screen.findByRole('menu');
  expect(screen.queryByRole('menuitem', { name: 'Copy subject' })).not.toBeInTheDocument();
  cleanup();

  render(TileContextMenu, { assets: [clip] });
  await fireEvent.contextMenu(screen.getByRole('button', { name: clip.id }));
  await screen.findByRole('menu');
  expect(screen.queryByRole('menuitem', { name: /Download for/ })).not.toBeInTheDocument();
});
