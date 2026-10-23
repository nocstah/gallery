import { fireEvent, render, screen, cleanup } from '@testing-library/svelte';
import { addMessages, locale } from 'svelte-i18n';
import { afterEach, expect, it, vi } from 'vitest';
import { timelineAssetFactory } from '@test-data/factories/asset-factory';
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

afterEach(cleanup);

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
