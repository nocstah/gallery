import { render, screen, within } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { createRawSnippet, tick } from 'svelte';
import TimelineRepresentativeBuckets from '$lib/components/timeline/TimelineRepresentativeBuckets.svelte';
import type { TimelineGrouping } from '$lib/managers/timeline-manager/types';
import { layoutPeriodGrid } from '$lib/utils/period-grid';
import type { ActivatableTimelineBucket } from '$lib/utils/timeline-zoom-navigation';

type RepresentativeTimelineBucket = ActivatableTimelineBucket & {
  viewId: string;
  timeBucket: string;
  top: number;
  height: number;
  isLoaded: boolean;
  count: number;
  representativeAssetId: string | null;
  representativeThumbhash: string | null;
  representativeRatio: number | null;
};

const bucket = (
  year: number,
  top: number,
  overrides: Partial<RepresentativeTimelineBucket> = {},
): RepresentativeTimelineBucket => ({
  grouping: 'year',
  viewId: `year:${year}-01-01`,
  timeBucket: `${year}-01-01`,
  date: { year },
  count: 100 + year,
  top,
  height: 296,
  isLoaded: true,
  representativeAssetId: `asset-${year}`,
  representativeThumbhash: `thumbhash-${year}`,
  representativeRatio: 1.5,
  ...overrides,
});

const monthBucket = (
  year: number,
  month: number,
  top: number,
  overrides: Partial<RepresentativeTimelineBucket> = {},
): RepresentativeTimelineBucket => ({
  grouping: 'month',
  viewId: `month:${year}-${String(month).padStart(2, '0')}-01`,
  timeBucket: `${year}-${String(month).padStart(2, '0')}-01`,
  date: { year, month },
  count: month * 10,
  top,
  height: 296,
  isLoaded: true,
  representativeAssetId: `asset-${year}-${month}`,
  representativeThumbhash: `thumbhash-${year}-${month}`,
  representativeRatio: 1.5,
  ...overrides,
});

describe('TimelineRepresentativeBuckets', () => {
  it('renders visible representative buckets at absolute positions and marks wrapper grouping', () => {
    render(TimelineRepresentativeBuckets, {
      grouping: 'year',
      buckets: [bucket(2016, 120), bucket(2015, 460)],
      visibleWindow: { top: 100, bottom: 600 },
    });

    const wrapper = screen.getByTestId('timeline-representative-buckets');
    expect(wrapper).toHaveAttribute('data-grouping', 'year');

    const shell2016 = screen.getByTestId('timeline-bucket-shell-2016-01-01');
    const shell2015 = screen.getByTestId('timeline-bucket-shell-2015-01-01');
    expect(shell2016).toHaveStyle({ position: 'absolute', height: '296px', width: '100%' });
    expect(shell2016).toHaveStyle('transform: translateY(120px)');
    expect(shell2015).toHaveStyle('transform: translateY(460px)');
    expect(within(shell2016).getByTestId('timeline-bucket-card')).toHaveTextContent('2016');
    expect(within(shell2015).getByTestId('timeline-bucket-card')).toHaveTextContent('2015');
  });

  it('passes the fixed shell height through to each representative card', () => {
    render(TimelineRepresentativeBuckets, {
      grouping: 'year',
      buckets: [bucket(2016, 120, { representativeRatio: 0.5 })],
      visibleWindow: { top: 100, bottom: 600 },
    });

    const shell = screen.getByTestId('timeline-bucket-shell-2016-01-01');
    const frame = within(shell).getByTestId('timeline-bucket-frame');
    expect(frame).toHaveClass('h-full');
    expect(within(frame).getByTestId('timeline-bucket-card')).toHaveClass('size-full');
  });

  it('does not render a bucket outside the overscan window', () => {
    render(TimelineRepresentativeBuckets, {
      grouping: 'year',
      buckets: [bucket(2016, 120), bucket(2001, 2000)],
      visibleWindow: { top: 100, bottom: 600 },
    });

    expect(screen.getByTestId('timeline-bucket-shell-2016-01-01')).toBeInTheDocument();
    expect(screen.queryByTestId('timeline-bucket-shell-2001-01-01')).not.toBeInTheDocument();
  });

  it('renders an empty DOM in day mode', () => {
    const { container } = render(TimelineRepresentativeBuckets, {
      grouping: 'day',
      buckets: [bucket(2016, 120, { grouping: 'day', date: { year: 2016, month: 1, day: 1 } })],
      visibleWindow: { top: 0, bottom: 1000 },
    });

    expect(container.children).toHaveLength(0);
    expect(screen.queryByTestId('timeline-representative-buckets')).not.toBeInTheDocument();
  });

  it('forwards bucket activation payloads', async () => {
    const user = userEvent.setup();
    const activations: ActivatableTimelineBucket[] = [];

    render(TimelineRepresentativeBuckets, {
      grouping: 'year',
      buckets: [bucket(2016, 120)],
      visibleWindow: { top: 0, bottom: 1000 },
      onTimelineBucketActivate: (activation: ActivatableTimelineBucket) => {
        activations.push(activation);
      },
    });

    expect(screen.getByRole('button', { name: 'timeline_overview_card_semantics' })).toBeInTheDocument();

    await user.click(screen.getByTestId('timeline-bucket-card'));

    expect(activations).toEqual([{ grouping: 'year', date: { year: 2016 } }]);
  });

  it('renders unloaded bucket cards in loading state', () => {
    render(TimelineRepresentativeBuckets, {
      grouping: 'year',
      buckets: [bucket(2016, 120, { isLoaded: false })],
      visibleWindow: { top: 0, bottom: 1000 },
    });

    expect(screen.getByTestId('timeline-bucket-card')).toHaveAttribute('data-state', 'loading');
  });

  it('passes locale through to month bucket cards', () => {
    render(TimelineRepresentativeBuckets, {
      grouping: 'month',
      buckets: [monthBucket(2015, 8, 120)],
      visibleWindow: { top: 0, bottom: 1000 },
      locale: 'de-DE',
    });

    expect(screen.getByText('Aug. 2015')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'timeline_overview_card_semantics' })).toBeInTheDocument();
  });

  it('disables cards without forwarding activation', async () => {
    const user = userEvent.setup();
    const onTimelineBucketActivate = vi.fn();

    render(TimelineRepresentativeBuckets, {
      grouping: 'year' as TimelineGrouping,
      buckets: [bucket(2016, 120)],
      visibleWindow: { top: 0, bottom: 1000 },
      disabled: true,
      onTimelineBucketActivate,
    });

    const card = screen.getByTestId('timeline-bucket-card');
    await user.click(card);

    expect(card).toBeDisabled();
    expect(onTimelineBucketActivate).not.toHaveBeenCalled();
  });

  it('keeps a large bucket list bounded to the viewport overscan', () => {
    const buckets = Array.from({ length: 2500 }, (_, index) => bucket(1900 + index, index * 328));

    render(TimelineRepresentativeBuckets, {
      grouping: 'year',
      buckets,
      visibleWindow: { top: 0, bottom: 600 },
      onTimelineBucketActivate: () => {},
    });

    expect(screen.getAllByTestId('timeline-bucket-card').length).toBeLessThan(10);
  });

  it('calls onRequestCovers with visible bucket timeBuckets on mount', async () => {
    const onRequestCovers = vi.fn();

    render(TimelineRepresentativeBuckets, {
      grouping: 'year',
      buckets: [bucket(2016, 120), bucket(2015, 460), bucket(2001, 2000)],
      visibleWindow: { top: 100, bottom: 600 },
      onRequestCovers,
    });
    await tick();

    // Only the two visible buckets (not the out-of-overscan bucket at top=2000)
    expect(onRequestCovers).toHaveBeenCalledTimes(1);
    expect(onRequestCovers).toHaveBeenCalledWith(['2016-01-01', '2015-01-01']);
  });

  it('does not call onRequestCovers in day mode', async () => {
    const onRequestCovers = vi.fn();

    render(TimelineRepresentativeBuckets, {
      grouping: 'day',
      buckets: [bucket(2016, 120, { grouping: 'day', date: { year: 2016, month: 1, day: 1 } })],
      visibleWindow: { top: 0, bottom: 1000 },
      onRequestCovers,
    });
    await tick();

    expect(onRequestCovers).not.toHaveBeenCalled();
  });

  it('does not call onRequestCovers when no buckets are visible', async () => {
    const onRequestCovers = vi.fn();

    render(TimelineRepresentativeBuckets, {
      grouping: 'year',
      buckets: [bucket(2001, 2000)],
      visibleWindow: { top: 0, bottom: 100 },
      onRequestCovers,
    });
    await tick();

    expect(onRequestCovers).not.toHaveBeenCalled();
  });

  it('offsets bucket transforms by renderOffset', () => {
    render(TimelineRepresentativeBuckets, {
      grouping: 'year',
      buckets: [bucket(2016, 120)],
      visibleWindow: { top: 100, bottom: 600 },
      renderOffset: 50,
    });

    expect(screen.getByTestId('timeline-bucket-shell-2016-01-01')).toHaveStyle('transform: translateY(170px)');
  });

  // Local Omarchy layer: a page's own action beside a period's card (Photos: a year in Room), the card still its own
  it("puts the page's own action beside each period's card, and the card still opens it", async () => {
    const onTimelineBucketActivate = vi.fn();
    const bucketAction = createRawSnippet((period: () => RepresentativeTimelineBucket) => ({
      render: () => `<a data-testid="period-action" href="/room?year=${period().date.year}">Room</a>`,
    }));

    render(TimelineRepresentativeBuckets, {
      grouping: 'year',
      buckets: [bucket(2016, 120), bucket(2015, 460)],
      visibleWindow: { top: 100, bottom: 600 },
      bucketAction,
      onTimelineBucketActivate,
    });

    const frame = within(screen.getByTestId('timeline-bucket-shell-2015-01-01')).getByTestId('timeline-bucket-frame');
    expect(within(frame).getByTestId('period-action')).toHaveAttribute('href', '/room?year=2015');
    expect(screen.getAllByTestId('period-action')).toHaveLength(2);

    await userEvent.click(within(frame).getByTestId('timeline-bucket-card'));
    expect(onTimelineBucketActivate).toHaveBeenCalledWith({ grouping: 'year', date: { year: 2015 } });
  });

  // Local Omarchy layer: the Years and Months overviews as the archive's shape (utils/period-grid)
  describe('in the decade grid', () => {
    // 2026 and 2024 in the 2020s, 1989 alone in the 1980s, nothing from 1979 to 1988, 1977 and 1978 in the 1970s
    const years = [2026, 2024, 1989, 1978, 1977].map((year) => bucket(year, 0, { count: year === 2024 ? 1000 : 250 }));
    const grid = layoutPeriodGrid(
      years.map(({ date, count }) => ({ slot: date.year, count })),
      { kind: 'year', width: 2287, gap: 10 },
    )!;
    const renderGrid = (props: Record<string, unknown> = {}) =>
      render(TimelineRepresentativeBuckets, {
        grouping: 'year',
        buckets: years,
        grid,
        visibleWindow: { top: 0, bottom: 2000 },
        ...props,
      });

    it('names each decade and draws its years in reading order, the years without photos as gaps', () => {
      renderGrid();

      expect(screen.getAllByRole('heading', { level: 2 })).toHaveLength(3);
      const order = screen
        .getAllByTestId(/^timeline-bucket-shell-/)
        .map((shell) => shell.dataset.testid?.replace('timeline-bucket-shell-', ''));
      expect(order).toEqual(['2024-01-01', '2026-01-01', '1989-01-01', '1977-01-01', '1978-01-01']);
      // 2020 to 2023, 2025 and 1979 to 1988 are gaps, out of a screen reader's way; 2027 and 1976 are not drawn
      const gaps = document.querySelectorAll('.ws-period-gap');
      expect([...gaps].map((gap) => gap.textContent?.trim())).toEqual([
        '2020',
        '2021',
        '2022',
        '2023',
        '2025',
        '1980',
        '1981',
        '1982',
        '1983',
        '1984',
        '1985',
        '1986',
        '1987',
        '1988',
        '1979',
      ]);
      expect([...gaps].every((gap) => gap.getAttribute('aria-hidden') === 'true')).toBe(true);
    });

    it('places each year at its cell and draws its weight against the busiest year', () => {
      renderGrid({ renderOffset: 5 });

      const cell = grid.rows
        .flatMap((row) => (row.kind === 'period' ? row.cells : []))
        .find(({ slot }) => slot === 1977)!;
      const shell = screen.getByTestId('timeline-bucket-shell-1977-01-01');
      expect(shell).toHaveStyle({ left: `${cell.left}px`, width: `${cell.width}px`, height: `${cell.height}px` });
      expect(shell).toHaveStyle(`transform: translateY(${cell.top + 5}px)`);
      const bar = within(shell).getByTestId('timeline-bucket-card-density');
      expect(bar.firstElementChild).toHaveStyle({ width: '25%' });
    });

    it('moves the focus with the arrows along the reading order, and Home and End to the ends', async () => {
      renderGrid();
      const cards = screen.getAllByTestId('timeline-bucket-card');
      cards[1].focus();

      await userEvent.keyboard('{ArrowRight}');
      expect(document.activeElement).toBe(cards[2]);
      await userEvent.keyboard('{ArrowLeft}{ArrowLeft}');
      expect(document.activeElement).toBe(cards[0]);
      await userEvent.keyboard('{End}');
      expect(document.activeElement).toBe(cards.at(-1));
      await userEvent.keyboard('{Home}');
      expect(document.activeElement).toBe(cards[0]);
    });
  });

  it('says a run of years without photos to a screen reader as one line', () => {
    const months = [monthBucket(2026, 3, 0), monthBucket(2024, 7, 0)];
    const grid = layoutPeriodGrid(
      months.map(({ date, count }) => ({ slot: date.year * 12 + date.month! - 1, count })),
      { kind: 'month', width: 2287, gap: 10 },
    )!;
    render(TimelineRepresentativeBuckets, {
      grouping: 'month',
      buckets: months,
      grid,
      visibleWindow: { top: 0, bottom: 3000 },
    });

    const run = document.querySelector('.ws-period-run');
    expect(run).toHaveTextContent('2025');
    expect(run).toHaveTextContent('timeline_overview_no_photos');
    // a month named alone, its row naming the year
    expect(
      within(screen.getByTestId('timeline-bucket-shell-2026-03-01')).getByTestId('timeline-bucket-card-title'),
    ).toHaveTextContent('Mar');
  });
});
