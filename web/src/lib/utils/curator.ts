import type { AssetResponseDto } from '@immich/sdk';

// Local Omarchy layer: client for Curator (~/code/curator), the local AI service behind the AI inbox. Curator runs
// beside Gallery on port 2290 of the same host and authenticates the browser's Gallery session cookie, so every call
// goes out with credentials. Nothing here writes to Gallery directly: accepting a suggestion asks Curator to apply it.

export type SuggestionStatus = 'pending' | 'rejected' | 'applied' | 'failed' | 'undone' | 'superseded';

export type InboxGroup = {
  key: string;
  kind: string;
  title: string;
  description: string | null;
  created_at: string;
  pending: number;
  applied: number;
  rejected: number;
  preview: string[] | null;
};

export type Suggestion = {
  id: number;
  kind: string;
  target_id: string;
  title: string;
  detail: string | null;
  asset_ids: string[];
  payload: Record<string, unknown>;
  confidence: number | null;
  status: SuggestionStatus;
  model: string | null;
  error: string | null;
  created_at: string;
  /** a trip's album or an event's reel: the event's story, which accepting puts in the description */
  story?: Story | null;
};

/** What stories.write told for an event, a trip or a memory (written by the text model from the captions). */
export type Story = { text: string; model: string; written_at: string; event_id?: number };

/** A conversation in the library chat (Curator's curator/chat.py), as the chat page lists it. */
export type ChatSummary = { id: string; title: string | null; updated_at: string };

/** What came of a tool the chat used: counts and flags, never the content (that went to the model). */
export type ChatOutcome = {
  error?: string;
  found?: number;
  best_matches?: number;
  total?: number;
  waiting?: number;
  proposed?: boolean;
  started?: boolean;
  photos?: number;
  story?: boolean;
  events?: number;
  people?: number;
  changes?: number;
  counts?: number;
};

/** A tool used while answering; `running` only while the answer streams. */
export type ChatStep = { tool: string; args: Record<string, unknown>; outcome?: ChatOutcome; running?: boolean };
/** The photos a step found or showed (`step` is the step's index). A visual search is `ranked`: its best matches. */
export type ChatPhotos = {
  step: number;
  total: number;
  ids: string[];
  ranked: boolean;
  search_id?: string;
  event_id?: number;
};
/** A suggestion the chat made; it waits in the AI inbox's "Asked in chat" batch for a yes. */
export type ChatProposal = { step: number; id: number; kind: string; title: string; photos: number };
/** A Curator job the chat started (a highlight reel), which proposes its result in the AI inbox. */
export type ChatJob = { step: number; id: number; kind: string; title: string };

export type ChatUserTurn = { role: 'user'; text: string; at?: string };
export type ChatAssistantTurn = {
  role: 'assistant';
  text: string;
  steps: ChatStep[];
  photos: ChatPhotos[];
  proposals: ChatProposal[];
  jobs: ChatJob[];
  error?: string | null;
  /** the person pressed Stop */
  stopped?: boolean;
};
export type ChatTurn = ChatUserTurn | ChatAssistantTurn;
export type ChatDetail = { id: string; title: string | null; turns: ChatTurn[]; updated_at: string };

/** The events a reply streams, in the order they come (POST /api/chat answers with server-sent events). */
export type ChatEvent =
  | { type: 'chat'; data: { id: string } }
  | { type: 'status'; data: { loading: string; making_way_for: string | null } }
  | { type: 'step'; data: { index: number; tool: string; args: Record<string, unknown> } }
  | { type: 'step_done'; data: { index: number; outcome: ChatOutcome } }
  | { type: 'photos'; data: ChatPhotos }
  | { type: 'proposal'; data: ChatProposal }
  | { type: 'job'; data: ChatJob }
  | { type: 'text'; data: { delta: string } }
  | { type: 'error'; data: { message: string } }
  | { type: 'done'; data: { id: string } };

export type GroupPage = {
  group: { key: string; kind: string; title: string; description: string | null };
  total: number;
  items: Suggestion[];
};

export type JobRow = {
  id: number;
  kind: string;
  status: 'queued' | 'running' | 'done' | 'failed' | 'cancelled';
  progress: { done?: number; total?: number; note?: string; paused?: boolean };
  result: Record<string, unknown> | null;
  error: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
};

export type JobKind = { kind: string; title: string; heavy: boolean };

export type Health = {
  gallery: { ok: boolean; owner: string | null };
  schema_drift: string[];
  jobs: Record<string, number>;
  pending: number;
  paused: boolean;
  disk: { free_gb: number; total_gb: number };
  last_backup: { file: string; at: number } | null;
  /** plain sentences from Curator: what waits on something other than review */
  notices: string[];
};

export type HistoryEntry = {
  id: number;
  suggestion_id: number | null;
  action: string;
  target_type: string;
  target_id: string;
  applied_at: string;
  undone_at: string | null;
  title: string | null;
  kind: string | null;
  asset_ids: string[] | null;
};

export type LabelItem = { key: string; asset_ids: string[]; cover: string | null };
export type LabelBatch = { set: string; items: LabelItem[]; labelled: number; target: number };

export type HealthItem = {
  key: string;
  title: string;
  value: number | null;
  attention: boolean;
  detail: string;
  link: string | null;
};

/** What needs attention in the library, from Curator's /api/library-health. */
export type LibraryHealth = {
  checked_at: string;
  items: HealthItem[];
  people_unnamed: { id: string; faces: number }[];
  months: { month: string; items: number; bytes: number }[];
  models: { loaded?: string[]; installed?: string[]; error?: string };
};

/** A question's answer: Gallery's own search results (the same asset objects Gallery returns). */
export type AskResult = {
  question: string;
  source: 'rules' | 'llm';
  answer: string | null;
  total: number;
  assets: AssetResponseDto[];
  plan: Record<string, unknown>;
  /** names in the question nobody in the library is called (yet) */
  unused: string[];
};

export type DecideResult = { applied?: number[]; failed?: number[]; rejected?: number; job?: number };

/** Undo refuses where the photo changed again since (conflicts) and reports what Gallery refused (failed). */
export type UndoResult = {
  undone: number[];
  conflicts: { id: number; reason: string }[];
  failed?: { id: number; reason: string }[];
};

export type LookUpSubject = {
  kind: 'plant' | 'animal' | 'landmark' | 'art' | 'food' | 'nature' | 'object' | 'other';
  name: string;
  about: string;
  sure: 'high' | 'medium' | 'low';
};
export type LookUpAnswer = { asset_id: string; model: string; subjects: LookUpSubject[] };

export type SmartStrictness = 'loose' | 'normal' | 'strict';
/** a smart album's saved search: Gallery's metadata-search filters, the typed words, and the Photos page URL it came
 * from (to open it there again for editing) */
export type SmartRule = {
  search: Record<string, unknown>;
  query?: string | null;
  strictness: SmartStrictness;
  filters: { url?: string };
};
export type SmartAlbum = {
  id: number;
  album_id: string;
  name: string;
  rule: SmartRule;
  count: number;
  excluded: number;
  synced_at: string | null;
};
export type SmartPreview = { count: number; newest: string[]; weakest: string[] };

export class CuratorError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

const base = () => `${location.protocol}//${location.hostname}:2290/api`;

/** A pending highlight reel, streamed by Curator (byte ranges, so the player can seek). */
export const reelUrl = (suggestionId: number) => `${base()}/reels/${suggestionId}.mp4`;
/** a restore suggestion's original ('before') or restored version ('after'): a photo `width` pixels across, or a clip */
export const restoredUrl = (suggestionId: number, which: 'before' | 'after', media: 'jpg' | 'mp4', width?: number) =>
  `${base()}/restored/${suggestionId}/${which}.${media}${width ? `?width=${width}` : ''}`;

const call = async <T>(path: string, init: RequestInit = {}): Promise<T> => {
  let response: Response;
  try {
    response = await fetch(base() + path, {
      ...init,
      credentials: 'include',
      headers: init.body ? { 'content-type': 'application/json' } : undefined,
    });
  } catch {
    throw new CuratorError('Curator is not answering', 0);
  }
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new CuratorError(body.detail ?? response.statusText, response.status);
  }
  if (response.status === 204) {
    return undefined as T;
  }
  return response.json() as Promise<T>;
};

const post = <T>(path: string, body: unknown) => call<T>(path, { method: 'POST', body: JSON.stringify(body) });

export const curator = {
  health: () => call<Health>('/health'),
  inbox: () => call<InboxGroup[]>('/inbox'),
  group: (key: string, status = 'pending', limit = 100, offset = 0) =>
    call<GroupPage>(
      `/inbox/${encodeURIComponent(key)}?status=${encodeURIComponent(status)}&limit=${limit}&offset=${offset}`,
    ),
  decide: (ids: number[], decision: 'accept' | 'reject') =>
    post<DecideResult>('/suggestions/decide', { ids, decision }),
  undo: (ids: number[]) => post<UndoResult>('/suggestions/undo', { ids }),
  /** a rejection or a failed apply back to waiting */
  reopen: (ids: number[]) => post<{ reopened: number[] }>('/suggestions/reopen', { ids }),
  libraryHealth: () => call<LibraryHealth>('/library-health'),
  history: (limit = 100) => call<HistoryEntry[]>(`/history?limit=${limit}`),
  kinds: () => call<JobKind[]>('/kinds'),
  jobs: (limit = 30) => call<JobRow[]>(`/jobs?limit=${limit}`),
  startJob: (kind: string, params: Record<string, unknown> = {}) => post<{ id: number }>('/jobs', { kind, params }),
  cancelJob: (id: number) => post<{ cancelled: boolean }>(`/jobs/${id}/cancel`, {}),
  nextLabels: (set: string, count = 10) => call<LabelBatch>(`/labels/${set}/next?count=${count}`),
  labelStats: (set: string) => call<{ labelled: number; target: number }>(`/labels/${set}`),
  ask: (question: string, size = 60, signal?: AbortSignal) =>
    call<AskResult>('/ask', { method: 'POST', body: JSON.stringify({ question, size }), signal }),
  /** start loading Ask's language model before the question arrives */
  warmAsk: () => post<{ warming: boolean }>('/ask/warm', {}),
  /** the story of a memory, of an album (by the event its photos come from) or of an event; null until written */
  story: (subject: { memory: string } | { album: string } | { event: number }) =>
    call<{ story: Story | null }>(
      `/stories?${new URLSearchParams(Object.entries(subject).map(([k, v]) => [k, String(v)]))}`,
    ),
  putLabel: (set: string, key: string, value: Record<string, unknown>) =>
    call<{ labelled: number; target: number }>(`/labels/${set}/${encodeURIComponent(key)}`, {
      method: 'PUT',
      body: JSON.stringify({ value }),
    }),
  suggestion: (id: number) => call<Suggestion>(`/suggestions/${id}`),
  /** the object-removal brush: a mask painted over a photo (a PNG data URL, white where it is to be filled in); the
   * job's result names the suggestion holding the new version */
  inpaint: (assetId: string, mask: string) =>
    post<{ job: number; mask: string }>('/inpaint', { asset_id: assetId, mask }),
  /** the library chat's earlier conversations, newest first */
  chats: () => call<ChatSummary[]>('/chats'),
  chat: (id: string) => call<ChatDetail>(`/chats/${encodeURIComponent(id)}`),
  forgetChat: (id: string) => call<void>(`/chats/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  /** a Live Photo effect picked in the photo viewer (`seconds`: where in the clip, for a key photo); the job's result
   * names the suggestion holding the new version */
  liveEffect: (assetId: string, effect: 'loop' | 'bounce' | 'long-exposure' | 'key-photo', seconds = 0) =>
    post<{ job: number }>('/live-effect', { asset_id: assetId, effect, seconds }),
  /** Look Up: what the photo shows that has a name (the kept answer unless `again`) */
  lookUp: (assetId: string, again = false, signal?: AbortSignal) =>
    call<LookUpAnswer>('/lookup', { method: 'POST', body: JSON.stringify({ asset_id: assetId, again }), signal }),
  /** smart albums: saved searches that keep a Gallery album filled */
  smartPreview: (rule: SmartRule, signal?: AbortSignal) =>
    call<SmartPreview>('/smart-albums/preview', { method: 'POST', body: JSON.stringify(rule), signal }),
  smartCreate: (name: string, rule: SmartRule) => post<SmartAlbum>('/smart-albums', { name, rule }),
  smartUpdate: (id: number, rule: SmartRule) =>
    call<SmartAlbum>(`/smart-albums/${id}`, { method: 'PUT', body: JSON.stringify(rule) }),
  smartForAlbum: (albumId: string) => call<SmartAlbum | null>(`/smart-albums/by-album/${albumId}`),
  smartGet: (id: number) => call<SmartAlbum[]>('/smart-albums').then((all) => all.find((s) => s.id === id)),
  smartStop: (id: number) => call<void>(`/smart-albums/${id}`, { method: 'DELETE' }),
};

/**
 * Server-sent events, fed in pieces as they arrive: each complete block ("event: name", "data: JSON", a blank line)
 * becomes one ChatEvent. A block cut between two pieces waits for the rest; a malformed one is skipped.
 */
export const createChatEventParser = (onEvent: (event: ChatEvent) => void) => {
  let buffer = '';
  const emit = (block: string) => {
    let type = 'message';
    const data: string[] = [];
    for (const line of block.split('\n')) {
      if (line.startsWith('event:')) {
        type = line.slice(6).trim();
      } else if (line.startsWith('data:')) {
        data.push(line.slice(5).replace(/^ /, ''));
      }
    }
    if (data.length === 0) {
      return;
    }
    try {
      onEvent({ type, data: JSON.parse(data.join('\n')) } as ChatEvent);
    } catch {
      // a block that is not JSON is no event of ours
    }
  };
  const push = (piece: string) => {
    buffer += piece.replaceAll('\r\n', '\n');
    let end = buffer.indexOf('\n\n');
    while (end !== -1) {
      emit(buffer.slice(0, end));
      buffer = buffer.slice(end + 2);
      end = buffer.indexOf('\n\n');
    }
  };
  /** the stream ended: a last block without its blank line still counts */
  const finish = () => {
    if (buffer.trim()) {
      emit(buffer);
    }
    buffer = '';
  };
  return { push, finish };
};

/**
 * Ask the library chat one question (a new conversation when `chatId` is null) and hand each event to `onEvent` as
 * it streams. Resolves 'ended' when the stream closes and 'aborted' when `signal` stopped it; throws a CuratorError
 * when Curator does not answer or refuses (status 0: not reachable).
 */
export const chatStream = async (
  chatId: string | null,
  message: string,
  onEvent: (event: ChatEvent) => void,
  signal?: AbortSignal,
): Promise<'ended' | 'aborted'> => {
  let response: Response;
  try {
    response = await fetch(`${base()}/chat`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json', accept: 'text/event-stream' },
      body: JSON.stringify({ chat_id: chatId, message }),
      signal,
    });
  } catch {
    if (signal?.aborted) {
      return 'aborted';
    }
    throw new CuratorError('Curator is not answering', 0);
  }
  if (!response.ok || !response.body) {
    const body = await response.json().catch(() => ({}));
    throw new CuratorError(body.detail ?? response.statusText, response.status);
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const parser = createChatEventParser(onEvent);
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      parser.push(decoder.decode(value, { stream: true }));
    }
    parser.push(decoder.decode());
    parser.finish();
    return 'ended';
  } catch {
    if (signal?.aborted) {
      return 'aborted';
    }
    throw new CuratorError('The answer was cut off', 0);
  }
};

/** Poll a Curator job until it leaves the queue. */
export const waitForJob = async (id: number, onProgress?: (job: JobRow) => void) => {
  for (;;) {
    const jobs = await curator.jobs(50);
    const job = jobs.find((row) => row.id === id);
    if (!job) {
      return;
    }
    onProgress?.(job);
    if (job.status !== 'queued' && job.status !== 'running') {
      return job;
    }
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
};
