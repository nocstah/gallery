import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/svelte';
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
});
