import { AssetTypeEnum, SharedLinkType, type SharedLinkResponseDto } from '@immich/sdk';
import { assetFactory } from '@test-data/factories/asset-factory';
import { sharedLinkFactory } from '@test-data/factories/shared-link-factory';
import { liveMemoryLinks, MEMORY_LINK_DAYS, memoryLinkDuration, memoryLinkExpiry } from './memory-sharing';

const NOW = Date.parse('2026-10-21T12:00:00.000Z');
const memory = { title: 'Riverton · October 2023', assetIds: ['a', 'b'] };
const photo = (id: string) => assetFactory.build({ id, type: AssetTypeEnum.Image });
const film = (originalFileName: string) =>
  assetFactory.build({ id: 'film', type: AssetTypeEnum.Video, originalFileName });
const link = (overrides: Partial<SharedLinkResponseDto>) =>
  sharedLinkFactory.build({
    type: SharedLinkType.Individual,
    description: memory.title,
    expiresAt: null,
    createdAt: '2026-10-20T00:00:00.000Z',
    assets: [photo('a')],
    ...overrides,
  });

describe('liveMemoryLinks', () => {
  it('finds the memory’s playable links and video files still open, newest first', () => {
    const older = link({ id: 'older', createdAt: '2026-10-01T00:00:00.000Z', assets: [photo('b')] });
    const video = link({ id: 'video', assets: [film('Riverton · October 2023 · Portrait video.mp4')] });
    const newest = link({ id: 'newest', createdAt: '2026-10-21T00:00:00.000Z' });

    expect(liveMemoryLinks([older, video, newest], memory, NOW)).toEqual([
      { link: newest, kind: 'memory' },
      { link: video, kind: 'video' },
      { link: older, kind: 'memory' },
    ]);
  });

  it('leaves out ended links, other memories’ links, album links and other people’s videos', () => {
    const links = [
      link({ id: 'ended', expiresAt: '2026-10-21T11:59:59.000Z' }),
      link({ id: 'renamed', description: 'Riverton' }),
      link({ id: 'album', type: SharedLinkType.Album }),
      link({ id: 'empty', assets: [] }),
      link({ id: 'elsewhere', assets: [photo('z')] }),
      link({ id: 'clip', assets: [film('IMG_0001.MOV')] }),
    ];

    expect(liveMemoryLinks(links, memory, NOW)).toEqual([]);
  });

  it('keeps a link that ends later today', () => {
    const later = link({ expiresAt: '2026-10-21T18:00:00.000Z' });

    expect(liveMemoryLinks([later], memory, NOW)).toEqual([{ link: later, kind: 'memory' }]);
  });

  it('knows a video by the name Curator gives its file, characters a file cannot hold made spaces', () => {
    const titled = { title: 'Anna: 10 / Ben', assetIds: ['a'] };
    const video = link({ description: titled.title, assets: [film('Anna 10 Ben · Landscape video.mp4')] });

    expect(liveMemoryLinks([video], titled, NOW)).toEqual([{ link: video, kind: 'video' }]);
  });
});

describe('the expiry choices', () => {
  it('offer 7 days, 30 days, a year and no end', () => {
    expect(MEMORY_LINK_DAYS).toEqual([7, 30, 365, null]);
    expect(memoryLinkDuration(7, 'en-US')).toBe('7 days');
    expect(memoryLinkDuration(30, 'en-US')).toBe('30 days');
    expect(memoryLinkDuration(365, 'en-US')).toBe('1 year');
    expect(memoryLinkDuration(30, 'de')).toBe('30 Tage');
  });

  it('end that many days from now, or never', () => {
    expect(memoryLinkExpiry(30, NOW)).toBe('2026-11-20T12:00:00.000Z');
    expect(memoryLinkExpiry(null, NOW)).toBeNull();
  });
});
