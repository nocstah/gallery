import { curator, type InboxGroup, type Suggestion } from '$lib/utils/curator';
import { kindQuery, kindsOf, newestBatch, runDays, runsOf, seriesOf, waitingIn } from '$lib/utils/curator-inbox';

// Local Omarchy layer: the AI inbox by kind. Batches Curator made one per night before it added to the waiting batch
// of their kind read as one row here, its counts summed and its runs' days in data type.

const batch = (key: string, overrides: Partial<InboxGroup> = {}): InboxGroup => ({
  key,
  kind: key.split(':', 1)[0],
  title: 'Restored prints and scans',
  description: 'Old prints and scans with scratches filled.',
  created_at: '2026-10-14T20:00:37.374944+00:00',
  pending: 40,
  applied: 0,
  rejected: 0,
  preview: [],
  ...overrides,
});

describe('seriesOf', () => {
  it('leaves out the day of the run that made the batch', () => {
    expect(seriesOf('restore.publish:prints:2026-10-18')).toBe('restore.publish:prints');
    expect(seriesOf('album.living:Best of:2026-10-15')).toBe('album.living:Best of');
    expect(seriesOf('asset.tag:Auto/QR codes:2026-10-11')).toBe('asset.tag:Auto/QR codes');
    expect(seriesOf('stack.cover:2026-10-14')).toBe('stack.cover');
  });

  it('keeps a key without a day, a batch of its own', () => {
    expect(seriesOf('smart.create:people')).toBe('smart.create:people');
    expect(seriesOf('album.create:Trips 2019-05-01')).toBe('album.create:Trips 2019-05-01');
  });
});

describe('runsOf', () => {
  it("takes Curator's days when it says them", () => {
    expect(runsOf(batch('restore.publish:prints:2026-10-15', { runs: ['2026-10-15', '2026-10-16'] }))).toEqual([
      '2026-10-15',
      '2026-10-16',
    ]);
  });

  it('falls back on the day in the key, then on the day the batch was made where the browser is', () => {
    expect(runsOf(batch('restore.publish:prints:2026-10-15'))).toEqual(['2026-10-15']);
    const made = new Date(2026, 9, 14, 9, 30); // local time, whatever the zone the test runs in
    expect(runsOf(batch('smart.create:people', { created_at: made.toISOString() }))).toEqual(['2026-10-14']);
  });
});

describe('kindsOf', () => {
  const groups = [
    batch('restore.publish:prints:2026-10-18', {
      created_at: '2026-10-17T20:00:40.101633+00:00',
      preview: ['a', 'b'],
      title: 'Restored prints and scans, newer words',
    }),
    batch('asset.archive:short:2026-10-11', {
      kind: 'asset.archive',
      title: 'Very short clips',
      created_at: '2026-10-10T17:30:39.552260+00:00',
      pending: 42,
      rejected: 1,
    }),
    batch('restore.publish:prints:2026-10-15', { preview: ['b', 'c'] }),
    batch('restore.publish:prints:2026-10-16', { created_at: '2026-10-15T20:00:29.679201+00:00', applied: 2 }),
    batch('smart.create:people', {
      kind: 'smart.create',
      title: 'People together',
      created_at: '2026-10-15T20:00:46Z',
    }),
  ];

  it('is one row per kind, its counts summed, the one waiting longest first', () => {
    const kinds = kindsOf(groups);
    expect(kinds.map((kind) => kind.series)).toEqual([
      'asset.archive:short',
      'restore.publish:prints',
      'smart.create:people',
    ]);
    const prints = kinds[1];
    expect(prints.keys).toEqual([
      'restore.publish:prints:2026-10-15',
      'restore.publish:prints:2026-10-16',
      'restore.publish:prints:2026-10-18',
    ]);
    expect([prints.pending, prints.applied, prints.rejected]).toEqual([120, 2, 0]);
    expect(prints.runs).toEqual(['2026-10-15', '2026-10-16', '2026-10-18']);
    expect(prints.oldest).toBe('2026-10-14T20:00:37.374944+00:00');
    // the newest batch's words, and each photo once
    expect(prints.title).toBe('Restored prints and scans, newer words');
    expect(prints.preview).toEqual(['b', 'c', 'a']);
  });

  it("goes by Curator's series and oldest waiting proposal when it says them", () => {
    const [first, second] = kindsOf([
      batch('restore.publish:prints:2026-10-15', { series: 'restore.publish:prints', oldest: '2026-10-17T20:00:00Z' }),
      batch('stack.cover:2026-10-14', { series: 'stack.cover', oldest: '2026-10-13T20:00:20Z', runs: ['2026-10-14'] }),
    ]);
    expect([first.series, second.series]).toEqual(['stack.cover', 'restore.publish:prints']);
    expect(first.runs).toEqual(['2026-10-14']);
  });

  it('opens a kind on all its batches', () => {
    expect(kindQuery(['restore.publish:prints:2026-10-15', 'asset.tag:Auto/QR codes:2026-10-11'])).toBe(
      'group=restore.publish%3Aprints%3A2026-10-15&group=asset.tag%3AAuto%2FQR+codes%3A2026-10-11',
    );
    expect(new URLSearchParams(kindQuery(['a:1', 'b,c:2'])).getAll('group')).toEqual(['a:1', 'b,c:2']);
  });

  it('takes the words of the batch made last', () => {
    expect(
      newestBatch([
        { created_at: '2026-10-15T00:00:00Z', n: 1 },
        { created_at: '2026-10-17T00:00:00Z', n: 2 },
      ]).n,
    ).toBe(2);
  });
});

describe('runDays', () => {
  const today = new Date(2026, 9, 18);

  it('names the month once for days of one month', () => {
    expect(runDays(['2026-10-15', '2026-10-16', '2026-10-18'], 'en-US', today)).toBe('Oct 15 · 16 · 18');
    expect(runDays(['2026-10-11'], 'en-US', today)).toBe('Oct 11');
  });

  it('names the month again where it changes, and the year where it is not this one', () => {
    expect(runDays(['2026-09-30', '2026-10-02'], 'en-US', today)).toBe('Sep 30 · Oct 2');
    expect(runDays(['2025-12-30', '2025-12-31', '2026-01-02'], 'en-US', today)).toBe('Dec 30, 2025 · 31 · Jan 2');
  });

  it('keeps the first day and the last two of a long run', () => {
    const days = ['2026-10-02', '2026-10-05', '2026-10-09', '2026-10-17', '2026-10-18'];
    expect(runDays(days, 'en-US', today)).toBe('Oct 2 · … · Oct 17 · 18');
  });

  it("speaks the reader's language", () => {
    expect(runDays(['2026-10-15', '2026-10-16'], 'de', today)).toBe('15. Okt. · 16.');
    expect(runDays(['2026-10-15', '2026-10-16'], 'zh-Hans', today)).toBe('10月15日 · 16日');
  });
});

describe('waitingIn', () => {
  const suggestion = (id: number, confidence: number | null): Suggestion => ({
    id,
    kind: 'restore.publish',
    target_id: `t${id}`,
    title: String(id),
    detail: null,
    asset_ids: [],
    payload: {},
    confidence,
    status: 'pending',
    model: null,
    error: null,
    created_at: '2026-10-15T20:00:00Z',
  });

  it("is one queue across a kind's batches, every page of each, most confident first", async () => {
    const big = Array.from({ length: 501 }, (_, n) => suggestion(1000 + n, 0.5));
    const pages: Record<string, Suggestion[]> = { a: [suggestion(1, 0.4), suggestion(2, null)], b: big };
    const group = vi.spyOn(curator, 'group').mockImplementation((key, _status, limit = 100, offset = 0) =>
      Promise.resolve({
        group: { key, kind: 'restore.publish', title: key, description: null },
        total: pages[key].length,
        items: pages[key].slice(offset, offset + limit),
      }),
    );
    const queue = await waitingIn(['a', 'b']);
    expect(queue).toHaveLength(503);
    expect(queue[0].id).toBe(1000);
    expect(queue.slice(-2).map((item) => item.id)).toEqual([1, 2]); // no confidence goes last, as Curator orders it
    expect(group.mock.calls.map((call) => [call[0], call[3]])).toEqual([
      ['a', 0],
      ['b', 0],
      ['b', 500],
    ]);
    group.mockRestore();
  });
});
