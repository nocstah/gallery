import { chatStream, createChatEventParser, CuratorError, type ChatEvent } from '$lib/utils/curator';

const encoder = new TextEncoder();

/** A response whose body streams these pieces and then closes (or never closes, until `signal` aborts it). */
const streaming = (pieces: string[], signal?: AbortSignal) =>
  ({
    ok: true,
    status: 200,
    body: new ReadableStream<Uint8Array>({
      start(controller) {
        for (const piece of pieces) {
          controller.enqueue(encoder.encode(piece));
        }
        if (signal) {
          signal.addEventListener('abort', () => controller.error(new DOMException('Aborted', 'AbortError')));
        } else {
          controller.close();
        }
      },
    }),
  }) as unknown as Response;

const collect = () => {
  const events: ChatEvent[] = [];
  return {
    events,
    onEvent: (event: ChatEvent) => {
      events.push(event);
    },
  };
};

describe('createChatEventParser', () => {
  it('waits for the rest of an event cut between two pieces', () => {
    const { events, onEvent } = collect();
    const parser = createChatEventParser(onEvent);
    parser.push('event: text\ndata: {"del');
    parser.push('ta": "Hel"}\n');
    expect(events).toEqual([]);
    parser.push('\nevent: text\ndata: {"delta": "lo"}\n\n');
    expect(events).toEqual([
      { type: 'text', data: { delta: 'Hel' } },
      { type: 'text', data: { delta: 'lo' } },
    ]);
  });

  it('reads several events from one piece, with Windows line ends too', () => {
    const { events, onEvent } = collect();
    const parser = createChatEventParser(onEvent);
    parser.push(
      'event: chat\r\ndata: {"id": "c1"}\r\n\r\nevent: step\ndata: {"index": 0, "tool": "inbox", "args": {}}\n\n',
    );
    expect(events.map((event) => event.type)).toEqual(['chat', 'step']);
    expect(events[0]).toEqual({ type: 'chat', data: { id: 'c1' } });
  });

  it('skips a block that is not JSON and goes on', () => {
    const { events, onEvent } = collect();
    const parser = createChatEventParser(onEvent);
    parser.push('event: text\ndata: not json\n\n: a comment line\n\nevent: done\ndata: {"id": "c1"}\n\n');
    expect(events).toEqual([{ type: 'done', data: { id: 'c1' } }]);
  });

  it('counts a last event without its blank line when the stream ends', () => {
    const { events, onEvent } = collect();
    const parser = createChatEventParser(onEvent);
    parser.push('event: done\ndata: {"id": "c1"}');
    expect(events).toEqual([]);
    parser.finish();
    expect(events).toEqual([{ type: 'done', data: { id: 'c1' } }]);
  });
});

describe('chatStream', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('posts the question with the Gallery session and hands over each event as it comes', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(streaming(['event: chat\ndata: {"id": "c1"}\n\nevent: te', 'xt\ndata: {"delta": "Hi"}\n\n']));
    vi.stubGlobal('fetch', fetchMock);
    const { events, onEvent } = collect();

    await expect(chatStream(null, 'Hello', onEvent)).resolves.toBe('ended');

    expect(events).toEqual([
      { type: 'chat', data: { id: 'c1' } },
      { type: 'text', data: { delta: 'Hi' } },
    ]);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toMatch(/:2290\/api\/chat$/);
    expect(init).toMatchObject({ method: 'POST', credentials: 'include' });
    expect(JSON.parse(init.body as string)).toEqual({ chat_id: null, message: 'Hello' });
  });

  it('ends quietly when the person stops it', async () => {
    const controller = new AbortController();
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(streaming(['event: text\ndata: {"delta": "Hal"}\n\n'], controller.signal))),
    );
    const { events } = collect();

    const result = chatStream(
      'c1',
      'Hi',
      (event) => {
        events.push(event);
        controller.abort();
      },
      controller.signal,
    );

    await expect(result).resolves.toBe('aborted');
    expect(events).toHaveLength(1);
  });

  it('says Curator is not answering when the request goes nowhere', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    await expect(chatStream(null, 'Hi', () => {})).rejects.toMatchObject({ status: 0 });
  });

  it('passes on what Curator refused', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        body: null,
        json: () => Promise.resolve({ detail: 'Sign in to Gallery first' }),
      }),
    );
    const refused = chatStream(null, 'Hi', () => {});
    await expect(refused).rejects.toBeInstanceOf(CuratorError);
    await expect(refused).rejects.toMatchObject({ message: 'Sign in to Gallery first', status: 401 });
  });
});
