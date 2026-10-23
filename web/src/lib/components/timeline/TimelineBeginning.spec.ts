import { AssetOrder, AssetOrderBy } from '@immich/sdk';
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/svelte';
import type { TimelineManager } from '$lib/managers/timeline-manager/timeline-manager.svelte';
import TimelineBeginning from './TimelineBeginning.svelte';

// Local Omarchy layer: Photos' timeline ends where the archive begins, under its oldest photo (DESIGN.md, Ink)
type Day = { year: number; month: number; day: number };

const managerOf = ({
  loaded = true,
  order = AssetOrder.Desc,
  orderBy = AssetOrderBy.TakenAt,
  days = [
    { year: 1977, month: 3, day: 14 },
    { year: 1977, month: 3, day: 12 },
  ] as Day[],
} = {}) => {
  const assets = days.map((localDateTime, index) => ({ id: `asset-${index}`, localDateTime }));
  const month = { isLoaded: loaded, lastTimelineDay: { getAssets: () => assets } };
  return {
    months: [{ isLoaded: true }, month],
    bottomSectionHeight: 60,
    getAssetOrder: () => order,
    getOrderBy: () => orderBy,
  } as unknown as TimelineManager;
};

describe('TimelineBeginning', () => {
  it("names the day of the timeline's oldest photo, under its last month", () => {
    render(TimelineBeginning, { props: { manager: managerOf() } });

    expect(screen.getByTestId('timeline-beginning')).toHaveTextContent('timeline_beginning');
    const date = screen.getByText('March 12, 1977');
    expect(date.tagName).toBe('TIME');
    expect(date).toHaveAttribute('datetime', '1977-03-12');
  });

  it('waits for the last month to load', () => {
    render(TimelineBeginning, { props: { manager: managerOf({ loaded: false }) } });

    expect(screen.queryByTestId('timeline-beginning')).not.toBeInTheDocument();
  });

  it('says nothing where the timeline runs oldest first, or by the day photos were added', () => {
    const { unmount } = render(TimelineBeginning, { props: { manager: managerOf({ order: AssetOrder.Asc }) } });
    expect(screen.queryByTestId('timeline-beginning')).not.toBeInTheDocument();
    unmount();

    render(TimelineBeginning, { props: { manager: managerOf({ orderBy: AssetOrderBy.CreatedAt }) } });
    expect(screen.queryByTestId('timeline-beginning')).not.toBeInTheDocument();
  });

  it('gives the leadout its room back when it goes', () => {
    const manager = managerOf();
    const { unmount } = render(TimelineBeginning, { props: { manager } });
    unmount();

    expect(manager.bottomSectionHeight).toBe(60);
  });
});
