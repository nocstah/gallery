import type { AssetResponseDto } from '@immich/sdk';
import type { AdjustSettings } from '$lib/components/curator/adjust-math';

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

/**
 * A bank transfer slip or payment QR code (Curator's jobs/slips.py) with its two readings of the amount, in baht: one
 * from Gallery's text recognition, one from the vision model. `agree`: both, and the same; `differ`: both, not the
 * same; `single`: only one; `none`: no amount (a code to receive money, say).
 */
export type Slip = {
  id: string;
  owner_id: string;
  visibility: string;
  taken_at: string | null;
  bank: string | null;
  amount: number | null;
  checked: number | null;
  status: 'agree' | 'differ' | 'single' | 'none';
  in_qr: boolean;
};

/**
 * Every slip, the QR album when there is one, a reading under way (its job id), and whether new slips and QR codes are
 * filed into QR as they arrive (Curator's qr.watch).
 */
export type SlipList = { album_id: string | null; slips: Slip[]; reading: number | null; auto: boolean };

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

/** A chat app a video can be made ready for (curator/share.py). */
export type ShareApp = 'whatsapp' | 'telegram';

/** A video made ready for a chat app: H.264 and AAC in an MP4 sized for the app. */
export type ShareResult = {
  /** the file's name, e.g. "IMG_1234 (WhatsApp).mp4" */
  name: string;
  size: number;
  width: number;
  height: number;
  fps: number;
  duration: number;
  /** under the app's size limit for a video; else the app sends it as a file, which does not play in the chat */
  fits: boolean;
  limit: number;
  source: string;
};

/** What a photo book is of (Curator's curator/books.py): an album, one of Curator's trips or events, or a year. */
export type BookSubject = { album_id: string } | { event_id: number } | { year: number };

/** A photo book's files: the interior for the print lab, its cover, and a light preview of the spreads to read. */
export type BookPart = 'book' | 'cover' | 'preview';

/** About how many photos a book can be asked for (curator/jobs/books.py); fewer go in when fewer are good. */
export const BOOK_PHOTOS = { least: 12, most: 400, standard: 120 } as const;

/** What book.make made: the PDFs in a folder of their own in ~/Pictures/Photo books. */
export type BookResult = {
  title: string;
  subtitle: string | null;
  /** the book's folder in Photo books */
  folder: string;
  files: Record<BookPart, { name: string; size: number; missing?: boolean }>;
  pages: number;
  photos: number;
  /** the photos it chose from */
  candidates: number;
  chapters: (string | null)[];
};

/** A photo book as it is made: its job, which goes from choosing the photos through the pages to the finishing. */
export type BookJob = {
  id: number;
  status: JobRow['status'];
  progress: { done?: number; total?: number; note?: 'choosing' | 'pages' | 'finishing' } | null;
  result: BookResult | null;
  /** the error's first line */
  error: string | null;
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

/** A video's frame saved as a photo (Curator's frame.save): the new photo, and where it came from. */
export type SavedFrame = {
  /** the new photo in Gallery */
  asset_id: string;
  /** the video it was taken from (a Live Photo's video half) */
  video_id: string;
  seconds: number;
  /** its capture time: the video's plus the moment, with the video's UTC offset */
  taken: string;
  file_name: string;
  width: number;
  height: number;
  /** tone-mapped from HDR, as the playback copy is */
  hdr: boolean;
};

export type StackPickPlace = {
  asset_id: string;
  judge: number;
  vlm: number | null;
  flaw: string | null;
  score: number;
};
/** what pick.best found: the pick, why (the vision model's words and the measured reasons), and every photo's place */
export type StackPick = {
  stack_id: string;
  best: string;
  cover: string;
  is_cover: boolean;
  judge_best: string;
  vlm_best: string | null;
  agree: boolean;
  decided_by: 'both' | 'vision' | 'measurements';
  why: string;
  measured: string[];
  note: string;
  sure: string;
  shots: number;
  places: StackPickPlace[];
  suggestion_id: number | null;
  model: string | null;
};

/** one backup copy: whether its last run went well, and when it last did (ISO) */
export type BackupCopy = { ok: boolean | null; last_ok: string | null; error: string | null };

/** the command center's view of Curator and the machine (/api/overview) */
export type CuratorOverview = {
  schedule: {
    enabled: boolean;
    next_night: string;
    last_night: string | null;
    jobs: { kind: string; title: string }[];
  };
  gpu: { name: string; used_mib: number; total_mib: number; busy: number; at: number } | null;
  models_loaded: { name: string; vram_gb: number }[];
  /** gallery-backup's two copies (the My Book every night, B2 once its key is in), as curator-health last saw them */
  backups: {
    mybook: BackupCopy;
    b2: BackupCopy & { configured: boolean };
  } | null;
  paused: boolean;
  pending: number;
  decided_today: number;
};

export type SmartStrictness = 'loose' | 'normal' | 'strict';
/** a smart album's saved search: Gallery's metadata-search filters, the typed words, and the Photos page URL it came
 * from (to open it there again for editing) */
export type SmartRule = {
  search: Record<string, unknown>;
  query?: string | null;
  strictness: SmartStrictness;
  filters: { url?: string };
  /** one of Apple's media types Curator tells from the camera data (selfies, panoramas, …); no Photos page search
   * holds it, so such a rule is not edited there */
  media?: string | null;
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

/** subject lift: the photo's main subject on transparency, as a PNG (a few seconds) */
export const curatorSubject = async (assetId: string): Promise<Blob> => {
  const response = await fetch(`${base()}/subject`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ asset_id: assetId }),
  });
  if (!response.ok) {
    let detail = response.statusText;
    try {
      detail = ((await response.json()) as { detail?: string }).detail ?? detail;
    } catch {
      // not JSON
    }
    throw new CuratorError(detail, response.status);
  }
  return response.blob();
};

/** The file Curator made for a chat app, sent as an attachment under its own name, so the browser saves it. */
export const shareVideoUrl = (assetId: string, app: ShareApp) => `${base()}/share/${assetId}/${app}.mp4`;
/** One of a photo book's PDFs: shown by the browser, or with `download` saved under its own name. */
export const bookFileUrl = (jobId: number, part: BookPart, download = false) =>
  `${base()}/books/${jobId}/${part}.pdf${download ? '?download=true' : ''}`;
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
  liveEffect: (assetId: string, effect: 'loop' | 'bounce' | 'long-exposure' | 'key-photo' | 'cinematic', seconds = 0) =>
    post<{ job: number }>('/live-effect', { asset_id: assetId, effect, seconds }),
  /** the frame a video (or a Live Photo's clip) is on, `seconds` in as the player counts, saved as a new photo; the
   * job's result is a SavedFrame */
  saveFrame: (assetId: string, seconds: number) => post<{ job: number }>('/frame', { asset_id: assetId, seconds }),
  /** Keep in the photo viewer's Adjust panel: the settings its preview showed, rendered at full size; the job's result
   * names the suggestion holding the new version */
  adjust: (assetId: string, settings: AdjustSettings) =>
    post<{ job: number }>('/adjust', { asset_id: assetId, settings }),
  overview: () => call<CuratorOverview>('/overview'),
  /** Gallery's duplicate groups that are QR-code slips (payment receipts), for the Duplicates page to leave out */
  duplicatesWithQr: () => call<{ groups: string[] }>('/duplicates/qr'),
  /** queue tonight's jobs now */
  runTonightNow: () => post<{ jobs: number[] }>('/schedule/run-now', {}),
  /** a video (or a Live Photo's clip) made ready for WhatsApp or Telegram: the file when it is already made, else the
   * job making it (its result is a ShareResult) */
  shareVideo: (assetId: string, app: ShareApp) =>
    post<{ ready?: ShareResult; job?: number }>('/share', { asset_id: assetId, preset: app }),
  /** pick a stack's best photo, carefully (a job of 10-60 seconds; its result is a StackPick) */
  pickBest: (stackId: string) => post<{ job: number }>(`/stacks/${stackId}/best`, {}),
  /** a photo book of an album, a trip or a year (`title` and `photos` left out: Curator's own); follow it with book() */
  makeBook: (subject: BookSubject, title?: string, photos?: number) =>
    post<{ job: number }>('/books', { ...subject, title, photos }),
  /** a photo book being made, or made */
  book: (jobId: number) => call<BookJob>(`/books/${jobId}`),
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
  /** bank slips and payment QR codes with their amounts, for Utilities › Bank slips */
  slips: () => call<SlipList>('/slips'),
  /** the switch for filing new slips and QR codes into QR as they arrive */
  setSlipsAuto: (enabled: boolean) =>
    call<{ auto: boolean }>('/slips/auto', { method: 'PUT', body: JSON.stringify({ enabled }) }),
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

/** Poll a Curator job until it leaves the queue, asking every `every` milliseconds (a quick job wants it sooner). */
export const waitForJob = async (id: number, onProgress?: (job: JobRow) => void, every = 1500) => {
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
    await new Promise((resolve) => setTimeout(resolve, every));
  }
};
