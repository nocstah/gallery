import '@testing-library/jest-dom';
import { fireEvent, render, screen, within } from '@testing-library/svelte';
import TimelineOverviewSwitch from './TimelineOverviewSwitch.svelte';

// Local Omarchy layer: the bar's way into the Years and Months overviews ("Years · Months"), and in an overview the way
// between them and back to the photos, as the Years / Months / All control on other pages
describe('TimelineOverviewSwitch', () => {
  const labels = () => screen.getAllByRole('button').map((button) => button.textContent);

  it('offers Years and Months beside the photos, neither pressed', () => {
    render(TimelineOverviewSwitch, { props: { grouping: 'day', onGrouping: vi.fn() } });

    const group = screen.getByRole('group', { name: 'timeline_grouping_selector' });
    const buttons = within(group).getAllByRole('button');
    expect(labels()).toEqual(['timeline_grouping_years', 'timeline_grouping_months']);
    for (const button of buttons) {
      expect(button).toHaveAttribute('aria-pressed', 'false');
    }
  });

  it('shows the overview open as pressed, with All as the way back to the photos', async () => {
    const onGrouping = vi.fn();
    render(TimelineOverviewSwitch, { props: { grouping: 'year', onGrouping } });

    expect(labels()).toEqual(['timeline_grouping_years', 'timeline_grouping_months', 'timeline_grouping_all']);
    expect(screen.getByRole('button', { name: 'timeline_grouping_years' })).toHaveAttribute('aria-pressed', 'true');
    await fireEvent.click(screen.getByRole('button', { name: 'timeline_grouping_all' }));
    expect(onGrouping).toHaveBeenCalledWith('day');
  });

  it('goes from one overview to the other, and the one open does nothing', async () => {
    const onGrouping = vi.fn();
    render(TimelineOverviewSwitch, { props: { grouping: 'month', onGrouping } });

    await fireEvent.click(screen.getByRole('button', { name: 'timeline_grouping_months' }));
    expect(onGrouping).not.toHaveBeenCalled();
    await fireEvent.click(screen.getByRole('button', { name: 'timeline_grouping_years' }));
    expect(onGrouping).toHaveBeenCalledWith('year');
  });

  it('waits while the overviews do (photos selected)', () => {
    render(TimelineOverviewSwitch, { props: { grouping: 'day' } });

    for (const button of screen.getAllByRole('button')) {
      expect(button).toBeDisabled();
    }
  });
});
