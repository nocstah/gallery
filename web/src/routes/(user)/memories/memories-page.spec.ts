import { MemoryType, type MemoryResponseDto } from '@immich/sdk';
import '@testing-library/jest-dom';
import { render, screen, within } from '@testing-library/svelte';
import type { Component } from 'svelte';
import TestWrapper from '$lib/components/TestWrapper.svelte';
import { memoryCards } from '$lib/utils/memory-cards';
import { memoryTitle } from '$lib/utils/memory-title';
import { assetFactory } from '@test-data/factories/asset-factory';
import MemoriesPage from './+page.svelte';

// Fork delta guard. Upstream's memory card renders the title only, but the fork's rule engine
// emits a subtitle alongside it (`mapMemory` -> `getMemoryDisplay`; the recent-trip rule's
// "12 photos over 3 days"). Dropping the subtitle from the card orphans both
// `getMemorySubtitle` and the `recent_trip_subtitle` i18n key, with nothing else failing.
const { mockMemoryManager, mockUserPreferencesManager } = vi.hoisted(() => {
  const manager = {
    memories: [] as MemoryResponseDto[],
    total: 0 as number | undefined,
    loading: undefined as Promise<void> | undefined,
    hasNextPage: false,
    applyPreferences: vi.fn(),
    // Local Omarchy layer: the cards as the real manager makes them (utils/memory-cards), titled by what the memories
    // say of themselves (no Curator in a test), on the day the fixtures are set
    get cards() {
      return memoryCards(
        manager.memories,
        (memory) => memoryTitle(memory, undefined, 'en-US')?.title,
        Date.UTC(2026, 9, 18, 10),
      );
    },
  };
  return {
    mockMemoryManager: manager,
    mockUserPreferencesManager: {
      hasMemoryPreferences: () => false,
      memories: { onlyFavorites: false, showUpcoming: true },
    },
  };
});

vi.mock('$lib/managers/memory-manager.svelte', () => ({ memoryManager: mockMemoryManager }));
vi.mock('$lib/managers/user-preferences-manager.svelte', () => ({
  userPreferencesManager: mockUserPreferencesManager,
}));

vi.mock('$lib/components/layouts/UserPageLayout.svelte', async () => {
  const { default: MockComponent } = await import('$lib/components/spaces/mock-user-page-layout.test-wrapper.svelte');
  return { default: MockComponent };
});

function memory(overrides: Partial<MemoryResponseDto> = {}): MemoryResponseDto {
  return {
    id: 'memory-1',
    ownerId: 'user-1',
    assets: [assetFactory.build({ id: 'asset-1', localDateTime: '2015-08-03T10:00:00.000Z' })],
    createdAt: '2020-01-01T00:00:00.000Z',
    updatedAt: '2020-01-01T00:00:00.000Z',
    deletedAt: undefined,
    type: MemoryType.OnThisDay,
    data: { year: 2015 },
    isSaved: false,
    memoryAt: '2020-01-01T00:00:00.000Z',
    seenAt: undefined,
    showAt: '2020-01-01T00:00:00.000Z',
    hideAt: undefined,
    ...overrides,
  };
}

function renderPage(memories: MemoryResponseDto[]) {
  mockMemoryManager.memories = memories;
  mockMemoryManager.total = memories.length;

  const props = { data: { meta: { title: 'Memories' } } };
  return render(TestWrapper as Component<{ component: typeof MemoriesPage; componentProps: typeof props }>, {
    component: MemoriesPage,
    componentProps: props,
  });
}

describe('Memories page', () => {
  // Local Omarchy layer: a card is titled by its facts, place and time (utils/memory-title), here the month of its
  // photo; the line under it is still the one the server sent, or the rule's own.
  it('titles a card by place and time, and keeps the rule-aware subtitle the server sends', () => {
    renderPage([memory({ type: MemoryType.Rule, subtitle: 'Coastal weekend', title: 'Recent trip to Lisbon' })]);

    expect(screen.getByText('August 2015')).toBeInTheDocument();
    expect(screen.getByText('Coastal weekend')).toBeInTheDocument();
  });

  it("names the rule's place in the title", () => {
    renderPage([
      memory({
        type: MemoryType.Rule,
        data: { ruleId: 'trip_anniversary', context: { city: 'Lisbon', placeLabel: 'Lisbon, Portugal' } },
      }),
    ]);

    expect(screen.getByText('Lisbon · August 2015')).toBeInTheDocument();
  });

  // the title says when, so the line under an on-this-day card says what kind it is and how long ago (utils/memory-cards)
  it('says how long ago under an on-this-day card', () => {
    renderPage([memory()]);

    expect(screen.getByText('August 2015')).toBeInTheDocument();
    // svelte-i18n is initialised without messages in tests, so `$t` echoes the key back
    expect(screen.getByText('memory_kind_on_this_day · years_ago')).toBeInTheDocument();
  });

  // a trip's line says it is one, and for how many days, from the rule context the server sends
  it("says a trip's kind and days from the rule context", () => {
    renderPage([
      memory({
        type: MemoryType.Rule,
        data: { ruleId: 'recent_trip', context: { placeLabel: 'Lisbon, Portugal', assetCount: 12, dayCount: 3 } },
      }),
    ]);

    expect(screen.getByText('memory_kind_trip · years_ago · memory_kind_days')).toBeInTheDocument();
  });

  // Local Omarchy layer: memories that read the same are one card (utils/memory-cards), today's first under a
  // heading of their own; upstream put the upcoming ones first under a body-size label
  it('shows memories that read the same as one card', () => {
    renderPage([
      memory({ id: 'day-1', showAt: '2026-10-18T00:00:00.000Z', hideAt: '2026-10-18T23:59:59.999Z' }),
      memory({
        id: 'day-2',
        showAt: '2026-10-17T00:00:00.000Z',
        hideAt: '2026-10-17T23:59:59.999Z',
        assets: [assetFactory.build({ id: 'asset-2', localDateTime: '2015-08-02T10:00:00.000Z' })],
      }),
    ]);

    expect(screen.getAllByText('August 2015')).toHaveLength(1);
    expect(screen.getByRole('link', { name: /August 2015/ })).toHaveAttribute(
      'href',
      '/memories/day-1?assetId=asset-2',
    );
  });

  it("heads today's, the earlier and the upcoming ones, in that order", () => {
    renderPage([
      memory({
        id: 'upcoming',
        showAt: '2026-10-20T00:00:00.000Z',
        hideAt: '2026-10-20T23:59:59.999Z',
        data: { year: 2019 },
        assets: [assetFactory.build({ id: 'asset-3', localDateTime: '2019-10-20T10:00:00.000Z' })],
      }),
      memory({ id: 'today', showAt: '2026-10-18T00:00:00.000Z', hideAt: '2026-10-18T23:59:59.999Z' }),
      memory({
        id: 'earlier',
        showAt: '2026-10-16T00:00:00.000Z',
        hideAt: '2026-10-16T23:59:59.999Z',
        data: { year: 2013 },
        assets: [assetFactory.build({ id: 'asset-4', localDateTime: '2013-10-16T10:00:00.000Z' })],
      }),
    ]);

    const headings = screen.getAllByRole('heading', { level: 2 });
    expect(headings.map((heading) => heading.textContent?.replaceAll(/\s+/g, ' ').trim())).toEqual([
      'memories_today 1',
      'memories_earlier 1',
      'memories_upcoming 1',
    ]);
    expect(within(screen.getByTestId('memories-today')).getByText('August 2015')).toBeInTheDocument();
    expect(within(screen.getByTestId('memories-upcoming')).getByText('October 2019')).toBeInTheDocument();
  });

  // Local Omarchy layer: the bar counts the cards it heads, not the server's memories (it read "(37)" over 23 cards)
  it('counts the cards in the bar, not the memories behind them', () => {
    const memories = [
      memory({ id: 'day-1', showAt: '2026-10-18T00:00:00.000Z', hideAt: '2026-10-18T23:59:59.999Z' }),
      memory({
        id: 'day-2',
        showAt: '2026-10-17T00:00:00.000Z',
        hideAt: '2026-10-17T23:59:59.999Z',
        assets: [assetFactory.build({ id: 'asset-2', localDateTime: '2015-08-02T10:00:00.000Z' })],
      }),
    ];
    mockMemoryManager.memories = memories;
    // Gallery's statistics count a memory its search leaves out, so the manager never thinks every memory is in
    mockMemoryManager.total = 3;
    mockMemoryManager.hasNextPage = true;
    try {
      const props = { data: { meta: { title: 'Memories' } } };
      render(TestWrapper as Component<{ component: typeof MemoriesPage; componentProps: typeof props }>, {
        component: MemoriesPage,
        componentProps: props,
      });

      expect(screen.getAllByText('August 2015')).toHaveLength(1);
      expect(screen.getByTestId('user-page-layout')).toHaveAttribute('data-description', '(1)');
    } finally {
      mockMemoryManager.hasNextPage = false;
    }
  });

  it('renders no subtitle line for a memory that has none', () => {
    const { container } = renderPage([
      memory({ type: MemoryType.Rule, data: { ruleId: 'a_rule_without_words', context: {} } }),
    ]);

    expect(screen.getByText('August 2015')).toBeInTheDocument();
    expect(container.querySelectorAll(':scope a[href] p')).toHaveLength(1);
  });
});
