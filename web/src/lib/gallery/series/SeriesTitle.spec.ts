import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { comingDays, seriesCard } from '@test-data/factories/series-factory';
import SeriesPage from './SeriesPage.svelte';
import type { Coming, SeriesCard } from './series-api';
import { POLL_MS } from './series-state.svelte';

// Local Omarchy layer: the family page's title on a series' page (gallery/series), against a stand-in Curator: the
// field shows the series' name; Save sends what was typed, Curator tidying it, refusing a name or a day in its own
// words (said under the field until the owner types again), and giving the page its own title for an empty field; a
// title saved elsewhere comes into the field. Every word is an i18n key (the 'dev' locale). Synthetic titles only.

const mocks = vi.hoisted(() => ({
  auth: {
    authenticated: true,
    isSharedLink: false,
    user: { id: 'owner-id', isAdmin: true },
    params: {},
    preferences: { memories: { enabled: true, duration: 6 } },
  },
  success: vi.fn(),
  danger: vi.fn(),
}));
vi.mock('$lib/managers/auth-manager.svelte', () => ({ authManager: mocks.auth }));
vi.mock('$lib/components/layouts/UserPageLayout.svelte', async () => {
  const { default: stub } = await import('$lib/components/spaces/mock-user-page-layout.test-wrapper.svelte');
  return { default: stub };
});
vi.mock('@immich/ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@immich/ui')>()),
  toastManager: { success: mocks.success, danger: mocks.danger },
}));

// Curator's own words for a title it refuses, which the page says in the owner's language
const NAMES_SOMEONE = "The family page never shows anyone's name: take the name out of the title";
const PLACE_FROM_HOME = 'The family page never shows a place from home: take it out of the title';
const GIVES_A_DAY = 'The family page never gives a day of the month: take the date out of the title';

type Asked = { method: string; path: string; body?: Record<string, unknown> };
let asked: Asked[];
let coming: Coming;
let refusal: string | undefined;

beforeEach(() => {
  asked = [];
  refusal = undefined;
  coming = comingDays();
  vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
    const url = new URL(String(input));
    const request = {
      method: init?.method ?? 'GET',
      path: url.pathname,
      body: init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : undefined,
    };
    asked.push(request);
    if (request.path === '/api/series/7' && request.method === 'PATCH') {
      if (refusal) {
        return Promise.resolve(Response.json({ detail: refusal }, { status: 400 }));
      }
      // Curator tidies the spaces, and gives an empty title its own
      const name =
        String(request.body?.name ?? '')
          .split(/\s+/)
          .filter(Boolean)
          .join(' ') || 'From the beginning';
      const series: SeriesCard = { ...coming.series, name };
      coming = { ...coming, series };
      return Promise.resolve(Response.json({ series, job: null }));
    }
    if (request.path === '/api/series/7/coming') {
      return Promise.resolve(Response.json(coming));
    }
    return Promise.resolve(Response.json({ detail: 'Not Found' }, { status: 404 }));
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const show = () => render(SeriesPage, { props: { title: 'memory_series_title', seriesId: 7 } });
const titleForm = async () => {
  const form = await screen.findByTestId('series-title');
  return { form, field: within(form).getByLabelText('memory_series_page_title') as HTMLInputElement };
};
const patches = () => asked.filter(({ method }) => method === 'PATCH');

describe('the family page’s title', () => {
  it('shows the title the family page has, in the family page’s section, with what it never shows', async () => {
    show();
    const { form, field } = await titleForm();
    expect(screen.getByTestId('series-family')).toContainElement(form);
    expect(field).toHaveValue('From the beginning');
    expect(within(form).getByText('memory_series_page_title_hint')).toBeInTheDocument();
    // nothing to save until it changes
    expect(within(form).getByRole('button', { name: 'save' })).toBeDisabled();
  });

  it('saves what was typed, then shows what Curator kept and says so', async () => {
    show();
    const { form, field } = await titleForm();
    await fireEvent.input(field, { target: { value: 'Summers   at the lake ' } });
    await fireEvent.click(within(form).getByRole('button', { name: 'save' }));

    await waitFor(() => expect(mocks.success).toHaveBeenCalledExactlyOnceWith('memory_series_page_title_saved'));
    expect(patches()).toEqual([{ method: 'PATCH', path: '/api/series/7', body: { name: 'Summers   at the lake' } }]);
    expect(field).toHaveValue('Summers at the lake');
    expect(within(form).getByRole('button', { name: 'save' })).toBeDisabled();
  });

  it('saves on Enter, and an empty field gives the page Curator’s own title again', async () => {
    coming = comingDays({ series: seriesCard({ name: 'Summers at the lake' }) });
    show();
    const { form, field } = await titleForm();
    expect(field).toHaveValue('Summers at the lake');
    await fireEvent.input(field, { target: { value: '' } });
    await fireEvent.submit(form);

    await waitFor(() => expect(field).toHaveValue('From the beginning'));
    expect(patches()).toEqual([{ method: 'PATCH', path: '/api/series/7', body: { name: '' } }]);
  });

  it('says why Curator refused it, in the owner’s language, under the field, until the owner types again', async () => {
    refusal = NAMES_SOMEONE;
    show();
    const { form, field } = await titleForm();
    await fireEvent.input(field, { target: { value: 'Rowan at the lake' } });
    await fireEvent.click(within(form).getByRole('button', { name: 'save' }));

    const said = await within(form).findByRole('alert');
    expect(said).toHaveTextContent('memory_series_title_names_someone');
    expect(field).toHaveAttribute('aria-invalid', 'true');
    expect(field).toHaveAttribute('aria-errormessage', said.id);
    expect(field).toHaveValue('Rowan at the lake');
    expect(mocks.success).not.toHaveBeenCalled();
    // the page's own line says nothing of it: it is said where the title is typed
    expect(screen.queryByTestId('series-message')).not.toBeInTheDocument();

    await fireEvent.input(field, { target: { value: 'At the lake' } });
    expect(within(form).queryByRole('alert')).not.toBeInTheDocument();
    expect(field).not.toHaveAttribute('aria-invalid');

    refusal = GIVES_A_DAY;
    await fireEvent.input(field, { target: { value: 'At the lake on the 14th' } });
    await fireEvent.click(within(form).getByRole('button', { name: 'save' }));
    expect(await within(form).findByRole('alert')).toHaveTextContent('memory_series_title_gives_a_day');

    // a place from home (a trip's place is allowed, so Curator alone knows which)
    refusal = PLACE_FROM_HOME;
    await fireEvent.input(field, { target: { value: 'Summers in Riverton' } });
    await fireEvent.click(within(form).getByRole('button', { name: 'save' }));
    expect(await within(form).findByRole('alert')).toHaveTextContent('memory_series_title_home_place');

    // a refusal the page does not know stays in Curator's words
    refusal = 'Curator could not check the title just now';
    await fireEvent.input(field, { target: { value: 'Summers at the lake' } });
    await fireEvent.click(within(form).getByRole('button', { name: 'save' }));
    expect(await within(form).findByRole('alert')).toHaveTextContent('Curator could not check the title just now');
  });

  it('takes a title saved elsewhere into the field, and keeps what is being typed while the days come again', async () => {
    vi.useFakeTimers();
    coming = comingDays({ preparing: true });
    show();
    await vi.advanceTimersByTimeAsync(0);
    const { field } = await titleForm();

    coming = { ...coming, series: { ...coming.series, name: 'Riverton days' } };
    await vi.advanceTimersByTimeAsync(POLL_MS);
    expect(field).toHaveValue('Riverton days');

    await fireEvent.input(field, { target: { value: 'Riverton days and nights' } });
    await vi.advanceTimersByTimeAsync(POLL_MS);
    expect(field).toHaveValue('Riverton days and nights');
  });
});
