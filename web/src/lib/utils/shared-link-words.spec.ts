import { AssetTypeEnum, SharedLinkType } from '@immich/sdk';
import { DateTime } from 'luxon';
import { init, register, t, waitLocale } from 'svelte-i18n';
import { get } from 'svelte/store';
import { linkEnd, linkEndDay, linkFacts, linkKind } from '$lib/utils/shared-link-words';
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

describe('linkEndDay', () => {
  const now = DateTime.fromISO('2026-10-23T12:00:00', { zone: 'UTC' });

  it('says the day, and the year only when it is not this one', () => {
    expect(linkEndDay(DateTime.fromISO('2026-11-22T09:00:00', { zone: 'UTC' }), 'en-US', now)).toBe('Nov 22');
    expect(linkEndDay(DateTime.fromISO('2027-10-23T09:00:00', { zone: 'UTC' }), 'en-US', now)).toBe('Oct 23, 2027');
  });
});

// the owner's "one word for one thing": a link reads the same in Shared links, the Shared feed and the Share sheets
describe('linkFacts', () => {
  beforeAll(async () => {
    await init({ fallbackLocale: 'en-US' });
    register('en-US', () => import('$i18n/en.json'));
    await waitLocale('en-US');
  });

  const now = DateTime.fromISO('2026-10-23T12:00:00', { zone: 'UTC' });
  const text = (facts: { text: string }[]) => facts.map((fact) => fact.text).join(' · ');

  it('says what it is, who can open it and when it ends, then what a visitor may do beyond looking', () => {
    const link = individual({
      password: 'set',
      expiresAt: now.plus({ days: 5 }).toISO(),
      allowUpload: true,
      showMetadata: true,
    });
    expect(text(linkFacts(get(t), link, { what: 'Album', locale: 'en-US', now }))).toBe(
      'Album · Anyone with the link and its password · Ends in 5 days · Can add photos · Shows where photos were taken',
    );
  });

  it('says whether a visitor can download where the Share sheets ask for it', () => {
    const link = individual({ expiresAt: null, password: null });
    expect(text(linkFacts(get(t), link, { locale: 'en-US', now }))).toBe('Anyone with the link · Never ends');
    expect(text(linkFacts(get(t), link, { locale: 'en-US', now, download: true }))).toBe(
      'Anyone with the link · Never ends · Can download',
    );
  });

  it('marks the end, and an end that has passed, with the day and time it falls on', () => {
    const facts = linkFacts(get(t), individual({ expiresAt: now.minus({ days: 1 }).toISO() }), {
      locale: 'en-US',
      now,
    });
    expect(facts[1]).toMatchObject({ text: 'Ended yesterday', end: true, ended: true });
    expect(facts[1].title).toMatch(/Oct 22, 2026/);
  });
});
