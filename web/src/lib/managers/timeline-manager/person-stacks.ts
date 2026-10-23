import type { TimeBucketsResponseDto } from '@immich/sdk';
import type { TimelineAsset, TimelineGrouping } from './types';

/** A person-specific view of an existing stack. The real cover is never changed. */
export type PersonStackGroup = {
  id: string;
  primaryAssetId: string;
  representativeId: string;
  members: { id: string; localDateTime: string }[];
};

export class PersonStackIndex {
  readonly groups = new Map<string, PersonStackGroup>();
  readonly byAsset = new Map<string, PersonStackGroup>();
  readonly expanded = new Set<string>();

  constructor(groups: PersonStackGroup[]) {
    for (const group of groups) {
      this.groups.set(group.id, group);
      for (const member of group.members) {
        this.byAsset.set(member.id, group);
      }
    }
  }

  isHidden(id: string) {
    const group = this.byAsset.get(id);
    return !!group && id !== group.representativeId && !this.expanded.has(group.id);
  }

  /** Counts and month geometry must reflect the same representatives the tiles use. */
  buckets(buckets: TimeBucketsResponseDto[], grouping: TimelineGrouping): TimeBucketsResponseDto[] {
    const prefixLength = grouping === 'year' ? 4 : grouping === 'month' ? 7 : 10;
    const hidden = new Map<string, number>();
    for (const group of this.groups.values()) {
      for (const member of group.members) {
        if (!this.isHidden(member.id)) {
          continue;
        }
        const key = member.localDateTime.slice(0, prefixLength);
        hidden.set(key, (hidden.get(key) ?? 0) + 1);
      }
    }
    return buckets
      .map((bucket) => ({
        ...bucket,
        count: Math.max(0, bucket.count - (hidden.get(bucket.timeBucket.slice(0, prefixLength)) ?? 0)),
      }))
      .filter((bucket) => bucket.count > 0);
  }

  decorate(asset: TimelineAsset): TimelineAsset {
    const group = this.byAsset.get(asset.id);
    if (!group) {
      return asset;
    }
    return {
      ...asset,
      stack:
        asset.id === group.representativeId
          ? { id: group.id, primaryAssetId: group.primaryAssetId, assetCount: group.members.length }
          : null,
    };
  }
}
