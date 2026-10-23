import { AssetVisibility, TimeBucketSize, type TimeBucketAssetResponseDto } from '@immich/sdk';
import { sdkMock } from '$lib/__mocks__/sdk.mock';
import { eventManager } from '$lib/managers/event-manager.svelte';
import { stackExpandManager } from '$lib/managers/stack-expand-manager.svelte';
import { curator } from '$lib/utils/curator';
import { fromISODateTimeUTCToObject } from '$lib/utils/timeline-util';
import { assetFactory, timelineAssetFactory, toResponseDto } from '@test-data/factories/asset-factory';
import { toTimeBucketsRequest } from './internal/request-options';
import { PersonStackIndex, type PersonStackGroup } from './person-stacks';
import { TimelineManager } from './timeline-manager.svelte';

const jan = '2026-01-01T12:00:00.000Z';
const feb = '2026-02-01T12:00:00.000Z';
const groups: PersonStackGroup[] = [
  {
    id: 'stack-1',
    primaryAssetId: 'cover',
    representativeId: 'cover',
    members: [
      { id: 'cover', localDateTime: jan },
      { id: 'child', localDateTime: feb },
    ],
  },
  {
    id: 'stack-2',
    primaryAssetId: 'nonmatching-cover',
    representativeId: 'matching',
    members: [
      { id: 'matching', localDateTime: feb },
      { id: 'other', localDateTime: feb },
    ],
  },
];
const asset = (id: string, date: string) =>
  timelineAssetFactory.build({
    id,
    fileCreatedAt: fromISODateTimeUTCToObject(date),
    localDateTime: fromISODateTimeUTCToObject(date),
    visibility: AssetVisibility.Timeline,
    stack: null,
  });
const cover = asset('cover', jan);
const child = asset('child', feb);
const matching = asset('matching', feb);
const other = asset('other', feb);
const single = asset('single', jan);
const buckets = [
  { timeBucket: '2026-02-01', count: 3 },
  { timeBucket: '2026-01-01', count: 2 },
];

describe('person stack projection', () => {
  it('keeps a matching representative even when the real cover has no matching face', () => {
    const index = new PersonStackIndex(groups);
    expect(index.isHidden('matching')).toBe(false);
    expect(index.isHidden('other')).toBe(true);
    expect(index.decorate(matching).stack).toEqual({
      id: 'stack-2',
      primaryAssetId: 'nonmatching-cover',
      assetCount: 2,
    });
  });

  it('counts cross-month stacks once and omits periods containing only folded children', () => {
    const index = new PersonStackIndex([groups[0]]);
    expect(
      index.buckets(
        [
          { timeBucket: '2026-02-01', count: 1 },
          { timeBucket: '2026-01-01', count: 1 },
        ],
        'month',
      ),
    ).toEqual([{ timeBucket: '2026-01-01', count: 1 }]);
    expect(new PersonStackIndex(groups).buckets([{ timeBucket: '2026-01-01', count: 5 }], 'year')).toEqual([
      { timeBucket: '2026-01-01', count: 3 },
    ]);
  });

  it('exposes matching children only while their group is expanded', () => {
    const index = new PersonStackIndex(groups);
    index.expanded.add('stack-2');
    expect(index.isHidden('other')).toBe(false);
    expect(index.isHidden('child')).toBe(true);
    expect(index.decorate(other).stack).toBeNull();
    index.expanded.delete('stack-2');
    expect(index.isHidden('other')).toBe(true);
  });
});

describe('person timeline integration', () => {
  let manager: TimelineManager;
  const options = { personIds: ['person'], visibility: AssetVisibility.Timeline, groupPersonStacks: true };
  const responses: Record<string, TimeBucketAssetResponseDto> = {
    '2026-02-01': toResponseDto(child, matching, other),
    '2026-01-01': toResponseDto(cover, single),
  };
  beforeEach(() => {
    vi.resetAllMocks();
    sdkMock.getTimeBuckets.mockResolvedValue(buckets);
    sdkMock.getTimeBucket.mockImplementation(({ timeBucket }) => Promise.resolve(responses[timeBucket]));
    vi.spyOn(curator, 'personStacks').mockResolvedValue(groups);
    manager = new TimelineManager();
  });
  afterEach(() => {
    manager.destroy();
    vi.useRealTimers();
  });

  const ids = async () => {
    const result: string[] = [];
    for await (const item of manager.assetsIterator()) {
      result.push(item.id);
    }
    return result;
  };

  it('uses the same visible count before and after lazy loading; Add all retains the full total', async () => {
    await manager.updateOptions(options);
    expect(manager.assetCount).toBe(3);
    expect(manager.ungroupedAssetCount).toBe(5);
    expect(await ids()).toEqual(expect.arrayContaining(['matching', 'cover', 'single']));
    expect(await ids()).toHaveLength(3);
    expect(manager.assetCount).toBe(3);
    expect(manager.personStackMembers('stack-2')).toEqual(new Set(['matching', 'other']));
    expect(manager.months[0].getFirstAsset().stack?.assetCount).toBe(2);
  });

  it('does not send its local grouping option to Gallery or insert unrelated live photos', async () => {
    await manager.updateOptions(options);
    expect(toTimeBucketsRequest(options, TimeBucketSize.Day)).not.toHaveProperty('groupPersonStacks');
    expect(manager.canInsertAssetFromLiveEvent(asset('unrelated', feb))).toBe(false);
  });

  it('expands and collapses without losing the representative or duplicating the children', async () => {
    await manager.updateOptions(options);
    await ids();
    manager.setPersonStackExpanded('stack-2', true);
    manager.upsertAssets([other]);
    manager.upsertAssets([other]);
    expect(await ids()).toHaveLength(4);
    manager.setPersonStackExpanded('stack-2', false);
    manager.removeAssets(['other']);
    expect(await ids()).toHaveLength(3);
    expect(manager.navigationAsset({ id: 'other' })).toEqual({ id: 'matching' });
    expect(manager.navigationAsset({ id: 'child' })).toEqual({ id: 'cover' });
  });

  it('falls back to all photos when the grouping service is unavailable', async () => {
    vi.mocked(curator.personStacks).mockRejectedValue(new Error('offline'));
    await manager.updateOptions(options);
    expect(await ids()).toHaveLength(5);
    expect(manager.assetCount).toBe(5);
  });

  it('the badge expands only matching photos, and repeated clicks fold them back up', async () => {
    await manager.updateOptions(options);
    await ids();
    sdkMock.getStack.mockResolvedValue({
      id: 'stack-2',
      primaryAssetId: 'nonmatching-cover',
      assets: ['nonmatching-cover', 'matching', 'other'].map((id) =>
        assetFactory.build({
          id,
          localDateTime: feb,
          fileCreatedAt: feb,
          visibility: AssetVisibility.Timeline,
          isTrashed: false,
          stack: { id: 'stack-2', primaryAssetId: 'nonmatching-cover', assetCount: 3 },
        }),
      ),
    });
    stackExpandManager.reset(manager);
    await stackExpandManager.toggle('stack-2', 'matching');
    expect(await ids()).toEqual(expect.arrayContaining(['matching', 'other', 'cover', 'single']));
    expect(await ids()).toHaveLength(4);
    expect(stackExpandManager.position('other')?.total).toBe(2);
    await stackExpandManager.toggle('stack-2', 'matching');
    expect(await ids()).toHaveLength(3);
    expect(await ids()).not.toContain('nonmatching-cover');
    stackExpandManager.reset(undefined);
  });

  it('refreshes after a cover is removed so another matching photo can represent the stack', async () => {
    await manager.updateOptions(options);
    vi.useFakeTimers();
    eventManager.emit('AssetsDelete', ['cover']);
    await vi.advanceTimersByTimeAsync(200);
    expect(curator.personStacks).toHaveBeenCalledTimes(2);
  });

  it('replaces a folded month-overview cover with a visible photo', async () => {
    sdkMock.getTimeBucketCovers.mockResolvedValue([
      {
        timeBucket: '2026-02-01',
        representativeAssetId: 'child',
        representativeRatio: 1,
        representativeThumbhash: null,
      },
    ]);
    await manager.updateOptions({ ...options, grouping: 'month' });
    await manager.loadCoversForBuckets(['2026-02-01']);
    expect(manager.timelineBuckets[0].representativeAssetId).toBe('matching');
    expect(manager.assetCount).toBe(3);
  });
});
