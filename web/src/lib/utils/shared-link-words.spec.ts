import { AssetTypeEnum, SharedLinkType } from '@immich/sdk';
import { DateTime } from 'luxon';
import { linkEnd, linkKind } from '$lib/utils/shared-link-words';
import { assetFactory } from '@test-data/factories/asset-factory';
import { sharedLinkFactory } from '@test-data/factories/shared-link-factory';

const photo = () => assetFactory.build({ type: AssetTypeEnum.Image });
const video = () => assetFactory.build({ type: AssetTypeEnum.Video });
const individual = (overrides: Parameters<typeof sharedLinkFactory.build>[0] = {}) =>
  sharedLinkFactory.build({
    type: SharedLinkType.Individual,
    description: null,
    allowDownload: true,
    allowUpload: false,
    showMetadata: false,
    assets: [photo(), photo()],
    ...overrides,
  });

describe('linkKind', () => {
  it('knows an album link', () => {
    expect(linkKind(sharedLinkFactory.build({ type: SharedLinkType.Album }))).toBe('album');
  });

  it("knows a memory's film by the memory Share sheet's settings: named, nothing to download or add", () => {
    expect(linkKind(individual({ description: 'Riverton · October 2025', allowDownload: false }))).toBe('memory');
  });

  it('knows a memory saved as a video: one named video with downloads and its details on', () => {
    expect(
      linkKind(individual({ description: 'Riverton · October 2025', assets: [video()], showMetadata: true })),
    ).toBe('memory');
  });

  it('calls everything else photos, or videos when that is all it holds', () => {
    expect(linkKind(individual())).toBe('photos');
    expect(linkKind(individual({ description: 'Beach day' }))).toBe('photos');
    expect(linkKind(individual({ assets: [video()] }))).toBe('videos');
    expect(linkKind(individual({ assets: [video(), photo()] }))).toBe('photos');
  });
});

describe('linkEnd', () => {
  const now = DateTime.fromISO('2026-10-23T22:30:00', { zone: 'America/Chicago' });
  const at = (iso: string) => DateTime.fromISO(iso, { zone: 'America/Chicago' }).toUTC().toISO();

  it('counts calendar days, not hours', () => {
    expect(linkEnd(at('2026-10-24T08:00:00'), now)).toMatchObject({ state: 'ends', when: 'tomorrow', days: 1 });
    expect(linkEnd(at('2026-10-23T23:00:00'), now)).toMatchObject({ state: 'ends', when: 'today', days: 0 });
    expect(linkEnd(at('2026-10-28T09:00:00'), now)).toMatchObject({ state: 'ends', when: 'soon', days: 5 });
    expect(linkEnd(at('2026-11-22T09:00:00'), now)).toMatchObject({ state: 'ends', when: 'date', days: 30 });
  });

  it('says when a link ended', () => {
    expect(linkEnd(at('2026-10-23T09:00:00'), now)).toMatchObject({ state: 'ended', when: 'today' });
    expect(linkEnd(at('2026-10-22T23:59:00'), now)).toMatchObject({ state: 'ended', when: 'yesterday' });
    expect(linkEnd(at('2026-10-01T09:00:00'), now)).toMatchObject({ state: 'ended', when: 'date' });
  });

  it('knows a link that never ends', () => {
    expect(linkEnd(null, now)).toEqual({ state: 'never' });
    expect(linkEnd(undefined, now)).toEqual({ state: 'never' });
  });
});
