import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/svelte';
import TimelineMonthHeading from './TimelineMonthHeading.svelte';

// Local Omarchy layer: the month in view is Photos' heading in the bar, so it is that page's h1; beside a page's own
// title (an album, Favorites) it is quiet and the title is the heading
describe('TimelineMonthHeading', () => {
  const month = { year: 2025, month: 10 };

  it("is the page's h1 where it heads the bar", () => {
    render(TimelineMonthHeading, { props: { month } });

    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading).toBe(screen.getByTestId('timeline-month-heading'));
    expect(heading).toHaveTextContent('2025');
  });

  it("is no heading beside a page's own title", () => {
    render(TimelineMonthHeading, { props: { month, quiet: true } });

    expect(screen.queryByRole('heading')).not.toBeInTheDocument();
    expect(screen.getByTestId('timeline-month-heading').tagName).toBe('DIV');
  });

  // its words had said where they led only in a tooltip, and the heading read out every month the photos passed
  it('names its words by what they do, and itself by its date alone', () => {
    render(TimelineMonthHeading, { props: { month, onGrouping: vi.fn() } });

    expect(screen.getByRole('heading', { level: 1 })).toHaveAccessibleName('October 2025');
    expect(screen.getByRole('button', { name: 'timeline_heading_show_months' })).toHaveTextContent('October');
    expect(screen.getByRole('button', { name: 'timeline_heading_show_years' })).toHaveTextContent('2025');
  });

  it('opens the Months overview from its month and the Years overview from its year', async () => {
    const onGrouping = vi.fn();
    render(TimelineMonthHeading, { props: { month, onGrouping } });

    await fireEvent.click(screen.getByRole('button', { name: 'timeline_heading_show_months' }));
    await fireEvent.click(screen.getByRole('button', { name: 'timeline_heading_show_years' }));
    expect(onGrouping.mock.calls).toEqual([['month'], ['year']]);
  });

  it('is no live region', () => {
    render(TimelineMonthHeading, { props: { month } });

    expect(screen.getByTestId('timeline-month-heading')).not.toHaveAttribute('aria-live');
  });
});
