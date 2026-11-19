import { createFilterState } from '#lib/components/filter-panel/filter-panel.ts';
import { buildAlbumAssetPickerOptions, buildAlbumTimelineOptions } from '#lib/utils/album-filter-options.ts';
import { buildSpaceTimelineOptions } from '#lib/utils/space-filter-options.ts';
import { AssetOrder, AssetVisibility } from '@immich/sdk';
import { describe, expect, it } from 'vitest';

describe('space vs album timeline options — stack collapse (#751)', () => {
  it('space timeline requests stack collapse (withStacked: true) (E24)', () => {
    const options = buildSpaceTimelineOptions('space-1', createFilterState());

    expect(options.spaceId).toBe('space-1');
    expect(options.withStacked).toBe(true);
  });

  // Local Omarchy layer: the archived bank slips in Library's albums led its Photos as the newest photos
  it('leaves archived photos out of a space timeline, as Photos does', () => {
    const options = buildSpaceTimelineOptions('space-1', createFilterState());

    expect(options.visibility).toBe(AssetVisibility.Timeline);
  });

  // E25 kept the space-album detail page at parity with a normal album. Both now collapse stacks to a photo the album
  // holds (specs/2026-11-01-album-stack-collapse-design.md); they still share this one builder.
  it('space-album detail collapses stacks like any album (withStacked) (E25)', () => {
    const options = buildAlbumTimelineOptions('album-1', AssetOrder.Desc, createFilterState());

    expect(options.withStacked).toBe(true);
  });
});

describe('album asset picker options — favorites compose with cross-user scopes (#763 slice 4)', () => {
  it('an active favorite filter no longer suppresses partner scope', () => {
    const options = buildAlbumAssetPickerOptions('album-1', { ...createFilterState(), isFavorite: true });

    expect(options.isFavorite).toBe(true);
    expect(options.withPartners).toBe(true);
  });
});
