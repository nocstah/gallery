import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/svelte';
import { init, register, waitLocale } from 'svelte-i18n';
import type { TimelineManager } from '$lib/managers/timeline-manager/timeline-manager.svelte';
import TimelineWorkspaces from './TimelineWorkspaces.svelte';

// Local Omarchy layer: the bar's year strip (DESIGN.md, Time Strip)
describe('TimelineWorkspaces', () => {
  beforeAll(async () => {
    register('en-US', () => import('$i18n/en.json'));
    await init({ fallbackLocale: 'en-US', initialLocale: 'en-US' });
    await waitLocale('en-US');
  });

  const months = [
    { year: 1991, month: 6, assetCount: 3 },
    { year: 1989, month: 8, assetCount: 1 },
    { year: 1989, month: 2, assetCount: 1 },
    { year: 1978, month: 4, assetCount: 1 },
  ];
  const manager = {
    scrubberMonths: months,
    months: months.map((month) => ({ yearMonth: { year: month.year, month: month.month }, top: 0 })),
  } as unknown as TimelineManager;

  // the dotted breaks had been the only sign of the years between: the arrow keys went from 1989 to 1978 in silence
  it("tells a screen reader of the years without photos either side of a year, with the year's count", () => {
    render(TimelineWorkspaces, { timelineManager: manager, viewportMonth: { year: 1991, month: 6 } });

    expect(screen.getByRole('button', { name: '1991' })).toHaveAccessibleDescription('3 photos; 1990, no photos');
    expect(screen.getByRole('button', { name: '1989' })).toHaveAccessibleDescription(
      '2 photos; 1990, no photos; 1979–1988, no photos',
    );
    expect(screen.getByRole('button', { name: '1978' })).toHaveAccessibleDescription('1 photo; 1979–1988, no photos');
  });

  it('reads the years newest first, the year in view current', () => {
    render(TimelineWorkspaces, { timelineManager: manager, viewportMonth: { year: 1989, month: 8 } });

    const years = screen.getAllByRole('button').filter((button) => button.dataset.year);
    expect(years.map((button) => button.dataset.year)).toEqual(['1991', '1989', '1978']);
    expect(screen.getByRole('button', { name: '1989' })).toHaveAttribute('aria-current', 'true');
  });
});
