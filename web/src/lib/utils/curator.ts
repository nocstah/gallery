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
};

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
  putLabel: (set: string, key: string, value: Record<string, unknown>) =>
    call<{ labelled: number; target: number }>(`/labels/${set}/${encodeURIComponent(key)}`, {
      method: 'PUT',
      body: JSON.stringify({ value }),
    }),
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
