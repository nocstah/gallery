import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/svelte';
import { init, register, waitLocale } from 'svelte-i18n';
import HealthPanel from './HealthPanel.svelte';
import InboxOverview from './InboxOverview.svelte';

// Local Omarchy layer: the AI inbox's list and its Health panel say what they wait for while Curator answers, and if it
// cannot, say so in one quiet line with Retry (PanelStatus), where they had shown nothing at all, for good.

const { curatorMock } = vi.hoisted(() => ({
  curatorMock: { inbox: vi.fn(), libraryHealth: vi.fn() },
}));

vi.mock('$lib/utils/curator', async (importOriginal) => ({
  ...(await importOriginal<typeof import('$lib/utils/curator')>()),
  curator: curatorMock,
}));

beforeAll(async () => {
  register('en-US', () => import('$i18n/en.json'));
  await init({ fallbackLocale: 'en-US', initialLocale: 'en-US' });
  await waitLocale('en-US');
});

beforeEach(() => {
  curatorMock.inbox.mockReset();
  curatorMock.libraryHealth.mockReset();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('InboxOverview', () => {
  it('says what it waits for while Curator answers', () => {
    curatorMock.inbox.mockReturnValue(new Promise(() => {}));
    render(InboxOverview, { onRunScan: vi.fn(), onCalibrate: vi.fn() });

    expect(screen.getByRole('status')).toHaveTextContent('Loading the suggestions…');
  });

  it('says the list could not load, and Retry asks again', async () => {
    curatorMock.inbox.mockRejectedValueOnce(new Error('Curator is not answering')).mockResolvedValueOnce([]);
    render(InboxOverview, { onRunScan: vi.fn(), onCalibrate: vi.fn() });

    expect(await screen.findByText("Couldn't load the suggestions.")).toBeInTheDocument();
    await fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

    expect(curatorMock.inbox).toHaveBeenCalledTimes(2);
    expect(await screen.findByRole('heading', { name: 'Nothing waiting' })).toBeInTheDocument();
    expect(screen.queryByText("Couldn't load the suggestions.")).not.toBeInTheDocument();
  });
});

describe('HealthPanel', () => {
  it("says it waits for the library's health, then that it could not load it, with Retry", async () => {
    curatorMock.libraryHealth.mockRejectedValueOnce(new Error('Internal Server Error')).mockResolvedValueOnce({
      checked_at: '2026-10-18T10:00:00Z',
      items: [],
      people_unnamed: [],
      months: [],
      models: { installed: ['qwen'], loaded: [] },
    });
    render(HealthPanel);

    expect(screen.getByRole('status')).toHaveTextContent("Loading the library's health…");
    expect(await screen.findByText("Couldn't load the library's health.")).toBeInTheDocument();
    await fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

    expect(await screen.findByRole('heading', { name: 'Local models' })).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
