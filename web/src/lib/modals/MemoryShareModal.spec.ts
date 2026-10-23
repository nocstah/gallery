import '@testing-library/jest-dom';
import { cleanup, render, screen, waitFor } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { init, register, waitLocale } from 'svelte-i18n';
import { getAnimateMock } from '$lib/__mocks__/animate.mock';
import { buildFilmPlan } from '$lib/components/memories/film/film-plan';
import type { MemoryPresentation } from '$lib/components/memories/memory-sharing';
import MemoryShareModal from './MemoryShareModal.svelte';

const { makeSharedLink, prepare, save, shareMemory, keepFilm } = vi.hoisted(() => ({
  makeSharedLink: vi.fn(),
  prepare: vi.fn(),
  save: vi.fn(),
  shareMemory: vi.fn(),
  keepFilm: vi.fn(),
}));
vi.mock('$lib/managers/film-video-manager.svelte', () => ({
  filmVideos: { items: [], shareDialogOpen: false, prepare, save },
}));
vi.mock('$lib/utils/curator', () => ({ curator: { shareMemory, keepFilm } }));
vi.mock('$lib/utils', () => ({ copyToClipboard: vi.fn() }));
vi.mock('$lib/services/shared-link.service', () => ({
  makeSharedLink,
  shareLinkExpiry: () => '2026-11-20T00:00:00.000Z',
  asUrl: ({ key }: { key: string }) => `https://photos.example/share/${key}`,
}));

const presentation: MemoryPresentation = {
  assetIds: ['a', 'b'],
  name: 'Pattaya',
  title: 'Pattaya · October 2023',
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
    title: { text: 'Pattaya', line: 'October 2023' },
    tracks: [],
  }),
}));
const open = (initialMode: 'memory' | 'portrait' | 'landscape' = 'memory') =>
  render(MemoryShareModal, {
    memoryId: 'memory',
    presentation,
    getVideo,
    initialMode,
    onClose: vi.fn(),
  });

beforeAll(async () => {
  await init({ fallbackLocale: 'en-US' });
  register('en-US', () => import('$i18n/en.json'));
  await waitLocale('en-US');
});
beforeEach(() => {
  vi.clearAllMocks();
  Element.prototype.animate = getAnimateMock();
  makeSharedLink.mockResolvedValue({ id: 'link', key: 'key' });
  prepare.mockResolvedValue({ jobId: 41, status: 'ready' });
  keepFilm.mockResolvedValue({ assetId: 'export' });
  shareMemory.mockResolvedValue({ ready: true, count: 2 });
});
afterEach(async () => {
  cleanup();
  await new Promise((resolve) => setTimeout(resolve, 30));
});

it('creates a playable snapshot of the selected media without rendering a video', async () => {
  open();
  expect(screen.getByRole('radio', { name: /Playable memory/ })).toBeChecked();
  await userEvent.click(screen.getByRole('button', { name: 'Create link' }));
  await screen.findByText('Open shared memory');
  expect(makeSharedLink).toHaveBeenCalledWith(
    expect.objectContaining({ assetIds: ['a', 'b'], allowUpload: false, showMetadata: false }),
  );
  expect(shareMemory).toHaveBeenCalledWith('memory', { linkId: 'link', key: 'key', presentation });
  expect(prepare).not.toHaveBeenCalled();
});

it.each([
  ['portrait', 0.5625],
  ['landscape', 1.7778],
] as const)('prepares a %s MP4 without publishing on Download', async (mode, aspect) => {
  open(mode);
  await userEvent.click(screen.getByRole('button', { name: 'Download MP4' }));
  await waitFor(() => expect(save).toHaveBeenCalled());
  expect(prepare.mock.calls[0][0]).toMatchObject({ size: '720p', plan: { aspect } });
  expect(keepFilm).not.toHaveBeenCalled();
  expect(makeSharedLink).not.toHaveBeenCalled();
});

it('shares the finished MP4 with downloads enabled', async () => {
  open('portrait');
  await userEvent.click(screen.getByRole('button', { name: 'Create link' }));
  await screen.findByText('Open shared memory');
  expect(keepFilm).toHaveBeenCalledWith(41);
  expect(makeSharedLink).toHaveBeenCalledWith(expect.objectContaining({ assetIds: ['export'], allowDownload: true }));
  expect(shareMemory).not.toHaveBeenCalled();
});

it('retries a failed snapshot without creating a second public link', async () => {
  shareMemory.mockRejectedValueOnce(new Error('temporarily unavailable'));
  open();
  await userEvent.click(screen.getByRole('button', { name: 'Create link' }));
  await screen.findByRole('alert');
  await userEvent.click(screen.getByRole('button', { name: 'Create link' }));
  await screen.findByText('Open shared memory');
  expect(makeSharedLink).toHaveBeenCalledOnce();
  expect(shareMemory).toHaveBeenCalledTimes(2);
});
