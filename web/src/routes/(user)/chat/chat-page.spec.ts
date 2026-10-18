import { render, screen, waitFor, within } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { init, register, waitLocale } from 'svelte-i18n';
import { goto } from '$app/navigation';
import { chatStream, curator, type ChatEvent } from '$lib/utils/curator';
import { reactivePageMock } from '@test-data/mocks/reactive-page.mock.svelte';
import ChatPage from './+page.svelte';

vi.mock('$app/navigation', () => ({ goto: vi.fn(() => Promise.resolve()) }));

vi.mock('$app/state', async () => {
  const { reactivePageMock } = await import('@test-data/mocks/reactive-page.mock.svelte');
  return { page: reactivePageMock };
});

vi.mock('$lib/components/layouts/UserPageLayout.svelte', async () => {
  const { default: stub } = await import('$lib/components/spaces/mock-user-page-layout.test-wrapper.svelte');
  return { default: stub };
});

vi.mock('$lib/utils/curator', async (importOriginal) => {
  const original = await importOriginal<typeof import('$lib/utils/curator')>();
  return {
    ...original,
    chatStream: vi.fn(),
    curator: {
      ...original.curator,
      chats: vi.fn(() => Promise.resolve([])),
      chat: vi.fn(),
      forgetChat: vi.fn(() => Promise.resolve()),
      warmAsk: vi.fn(() => Promise.resolve({ warming: true })),
      suggestion: vi.fn(() => Promise.resolve({ id: 7, status: 'pending' })),
      decide: vi.fn(() => Promise.resolve({ applied: [7] })),
    },
  };
});

/** chatStream as Curator would answer: each event in turn, then the stream ends. */
const answering = (...events: ChatEvent[]) =>
  vi.mocked(chatStream).mockImplementationOnce((_chatId, _message, onEvent) => {
    for (const event of events) {
      onEvent(event);
    }
    return Promise.resolve('ended');
  });

const ids = Array.from({ length: 20 }, (_, index) => `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`);

const renderPage = () => render(ChatPage, { data: { meta: { title: 'Chat' } } as never });

/** The conversation itself: the header repeats the first question, and a screen-reader line the last answer. */
const thread = () => within(document.querySelector<HTMLElement>('.chat-turns')!);

beforeAll(async () => {
  register('en-US', () => import('$i18n/en.json'));
  await init({ fallbackLocale: 'en-US', initialLocale: 'en-US' });
  await waitLocale('en-US');
});

beforeEach(() => {
  vi.clearAllMocks();
  reactivePageMock.reset('https://gallery.test/chat');
});

describe('the chat page', () => {
  it('offers example questions that ask right away, and warms the model', async () => {
    answering({ type: 'chat', data: { id: 'c1' } }, { type: 'done', data: { id: 'c1' } });
    const user = userEvent.setup();
    renderPage();

    expect(screen.getByRole('heading', { name: 'Ask your library' })).toBeInTheDocument();
    expect(curator.warmAsk).toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Which trips have the most photos?' }));

    expect(chatStream).toHaveBeenCalledWith(
      null,
      'Which trips have the most photos?',
      expect.any(Function),
      expect.any(AbortSignal),
    );
    expect(goto).toHaveBeenCalledWith('?id=c1', expect.objectContaining({ replaceState: true }));
  });

  it('shows the steps, the photos they found, a proposal to accept, and the answer', async () => {
    answering(
      { type: 'chat', data: { id: 'c1' } },
      { type: 'step', data: { index: 0, tool: 'search_photos', args: { people: ['Simon'], visual: 'beach' } } },
      { type: 'photos', data: { step: 0, total: 34, ids, ranked: false, search_id: 's1' } },
      { type: 'step_done', data: { index: 0, outcome: { found: 34 } } },
      { type: 'step', data: { index: 1, tool: 'propose_album', args: { name: 'Beach days', search_id: 's1' } } },
      { type: 'proposal', data: { step: 1, id: 7, kind: 'album.create', title: 'Album “Beach days”', photos: 34 } },
      { type: 'step_done', data: { index: 1, outcome: { proposed: true, photos: 34 } } },
      { type: 'text', data: { delta: 'I found 34 photos of Simon at the beach' } },
      { type: 'text', data: { delta: ' and proposed an album.' } },
      { type: 'done', data: { id: 'c1' } },
    );
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByRole('textbox'), 'Make an album of Simon at the beach{Enter}');

    expect(thread().getByText('Make an album of Simon at the beach')).toBeInTheDocument();
    expect(screen.getByText('Searched the photos')).toBeInTheDocument();
    expect(screen.getByText('Simon')).toBeInTheDocument();
    expect(screen.getByText('“beach”')).toBeInTheDocument();
    expect(screen.getByText('34 found')).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /^Photo \d+$/ })).toHaveLength(12);
    expect(screen.getByText('20 of 34 shown')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Show all 20' }));
    expect(screen.getAllByRole('link', { name: /^Photo \d+$/ })).toHaveLength(20);

    expect(thread().getByText('I found 34 photos of Simon at the beach and proposed an album.')).toBeInTheDocument();
    expect(screen.getByText('Proposed an album')).toBeInTheDocument();
    // the button says what accepting does: an album proposed in the chat is made
    const accept = await screen.findByRole('button', { name: 'Make album' });
    await waitFor(() => expect(accept).toBeEnabled());
    await user.click(accept);
    expect(curator.decide).toHaveBeenCalledWith([7], 'accept');
    expect(await screen.findByText(/Applied/)).toBeInTheDocument();
  });

  it('says why an answer broke off and asks again on Try again', async () => {
    answering(
      { type: 'chat', data: { id: 'c1' } },
      { type: 'error', data: { message: 'the local model did not answer' } },
      { type: 'done', data: { id: 'c1' } },
    );
    answering(
      { type: 'chat', data: { id: 'c1' } },
      { type: 'text', data: { delta: 'Here it is.' } },
      { type: 'done', data: { id: 'c1' } },
    );
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByRole('textbox'), 'When were we in Oslo?{Enter}');
    expect(screen.getByRole('alert')).toHaveTextContent('The answer stopped: the local model did not answer');

    await user.click(within(screen.getByRole('alert')).getByRole('button', { name: 'Try again' }));

    expect(chatStream).toHaveBeenCalledTimes(2);
    expect(vi.mocked(chatStream).mock.calls[1][1]).toBe('When were we in Oslo?');
    expect(vi.mocked(chatStream).mock.calls[1][0]).toBe('c1');
    expect(await thread().findByText('Here it is.')).toBeInTheDocument();
  });

  it('opens the conversation the URL names', async () => {
    reactivePageMock.reset('https://gallery.test/chat?id=c9');
    vi.mocked(curator.chat).mockResolvedValue({
      id: 'c9',
      title: 'Norway trips',
      updated_at: '2026-10-11T07:00:00Z',
      turns: [
        { role: 'user', text: 'Show me Norway' },
        {
          role: 'assistant',
          text: 'There are 3 trips to Norway.',
          steps: [{ tool: 'list_events', args: { words: 'Norway' }, outcome: { total: 3, events: 3 } }],
          photos: [],
          proposals: [],
          jobs: [],
        },
      ],
    });
    renderPage();

    expect(await screen.findByText('There are 3 trips to Norway.')).toBeInTheDocument();
    expect(thread().getByText('Show me Norway')).toBeInTheDocument();
    expect(curator.chat).toHaveBeenCalledWith('c9');
    expect(screen.getByText('Looked up events and trips')).toBeInTheDocument();
    expect(screen.getByText('3 events')).toBeInTheDocument();
    expect(screen.getByText('Norway trips')).toBeInTheDocument();
  });
});
