// Local Omarchy layer: Kioku's client for the library mover (gallery/moves), the service on this computer that moves
// photos from one of Kioku's libraries into another (kioku-library-mover.service). Its receiver listens on
// 127.0.0.1:2297 only. Every request leaves without credentials, so no cookie of Kioku's can go with it, in CORS mode,
// and a body is JSON, which the browser sends only after the receiver's preflight has agreed to this page's origin. A
// key's secret travels only in a request body, never in an address or a header, and the receiver decides by the
// page's origin alone what this library may do with a move. Nothing here keeps a key: each call takes it and lets go.

/** Where the mover's receiver listens: this computer only. */
export const MOVER_ORIGIN = 'http://127.0.0.1:2297';
/** The most a move takes at once: a selection, or the first of a person's photos. */
export const MOVE_LIMIT = 50_000;
/** The receiver answers from memory; a read waits this long at most. */
export const READ_TIMEOUT_MS = 4000;
/** A post waits this long at most, under the receiver's own 10 s socket timeout. */
export const POST_TIMEOUT_MS = 8000;

export const MOVE_STATES = [
  'checking',
  'planning',
  'ready',
  'starting',
  'running',
  'paused',
  'done',
  'cancelled',
  'expired',
  'failed',
  'refused',
] as const;
export type MoveState = (typeof MOVE_STATES)[number];
const ENDED_STATES: ReadonlySet<MoveState> = new Set(['done', 'cancelled', 'expired', 'failed', 'refused']);
/** Whether a move has ended: done, cancelled, expired, failed or refused. */
export const isEnded = (state: MoveState) => ENDED_STATES.has(state);

export type MoveSide = 'source' | 'destination';
/** A move key as a page hands it over: its id and its secret, straight from Kioku's answer. */
export type MoveKey = { id: string; secret: string };
/** The person a move is about: their id in the source library and the name the page showed (none: null). */
export type MovePerson = { id: string; name: string | null };
/** Hours of the day, host time ("01:45" to "03:30"), in which the mover starts no upload into the destination. */
export type QuietHours = { from: string; to: string };

export type MoveSourceShares = { sharedLinks: number; spaces: number; sharedAlbums: number; memories: number };
export type MovePlan = {
  items: number;
  groups: number;
  bytes: number;
  new: number;
  present: number;
  held: number;
  liveVideos: number;
  stackMates: number;
  gone: number;
  notOwned: number;
  remaining: number;
  sourceShares: MoveSourceShares | null;
};
export type MoveHold = { reason: string; items: number; forceable: boolean };
export type MoveCounts = { moved: number; present: number; copied: number; bothLibraries: number; bytes: number };
export type MoveFacesPerson = { id: string; named: boolean; hidden: boolean; faces: number };
export type MoveFacesProposal = { merge: string; into: string } | { name: string };
export type MoveFacesReport = {
  at: string | null;
  photos: number;
  waiting: number;
  unmatched: number;
  unassigned: number;
  people: MoveFacesPerson[];
  proposals: MoveFacesProposal[];
};

/** A move as the receiver reports it to this page's origin (MOVE-TO-LIBRARY.md, The status object). */
export type MoveStatus = {
  move: string;
  source: string;
  destination: string;
  /** the person a person's move is about; `archived` when their archived photos come too */
  person: (MovePerson & { archived: boolean }) | null;
  state: MoveState;
  phase: string | null;
  reason: string | null;
  needs: MoveSide[];
  refusal: { side: MoveSide; code: string } | null;
  plan: MovePlan | null;
  holds: MoveHold[];
  forced: string[];
  progress: MoveCounts;
  space: { needed: number; free: number } | null;
  trashDays: number | null;
  /**
   * the quiet hours this move keeps, when the receiver reports them (null: none); undefined when it does not say, and
   * the pages then take the mover's default (move-words, quietHours)
   */
  quiet?: QuietHours | null;
  /** the key this library's side handed over and the mover still holds: its id, never a secret */
  key: string | null;
  /** the source's own: the photos that stay, with their reasons */
  held: { asset: string; reason: string }[];
  /** the destination's own: its copies whose groups stayed behind */
  unfinished: string[];
  /** the destination's own, for a person's move: where its face recognition put that person */
  faces: MoveFacesReport | null;
  createdAt: string | null;
  updatedAt: string | null;
  endedAt: string | null;
};

/**
 * What the source page hands over: the move's id, the two libraries, the photos and/or the person, and its key. A
 * person alone takes their timeline; `archived` brings their archived photos too, which otherwise stay.
 */
export type MoveHandOff = {
  move: string;
  source: string;
  destination: string;
  assets?: string[];
  person?: { id: string; name?: string; archived?: true };
  key: MoveKey;
};

/**
 * Why a call to the mover did not go through: `unreachable` is no answer at all (nothing listens, the browser refused
 * it, or it took too long); the rest are the receiver's own answers (MOVE-TO-LIBRARY.md, Statuses).
 */
export type MoverErrorCode =
  'unreachable' | 'invalid' | 'forbidden' | 'unknown' | 'busy' | 'exists' | 'state' | 'stopping' | 'failed';

export class MoverError extends Error {
  constructor(
    readonly code: MoverErrorCode,
    readonly status?: number,
  ) {
    super(`kioku-library-mover: ${code}`);
    this.name = 'MoverError';
  }
}

/** The receiver gave no answer at all, so it may or may not have what was sent. */
export const unanswered = (error: unknown) => error instanceof MoverError && error.code === 'unreachable';

/** A move's id: a version 4 UUID, lower-case, as crypto.randomUUID makes it and the receiver takes it. */
export const MOVE_ID = /^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/;

/** A new move's id, which the receiver accepts once. */
export const newMoveId = (): string => {
  if (typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const count = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0);
const text = (value: unknown) => (typeof value === 'string' ? value : null);
const texts = (value: unknown, most = 1000) =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string').slice(0, most) : [];
const isState = (value: unknown): value is MoveState => MOVE_STATES.includes(value as MoveState);
const isSide = (value: unknown): value is MoveSide => value === 'source' || value === 'destination';
const HOUR = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const isHour = (value: unknown): value is string => typeof value === 'string' && HOUR.test(value);

/** The quiet hours a status reports: undefined when it says nothing, null for none or for what is not a window. */
const parseQuiet = (value: unknown): QuietHours | null | undefined => {
  if (value === undefined) {
    return;
  }
  return isRecord(value) && isHour(value.from) && isHour(value.to) ? { from: value.from, to: value.to } : null;
};

const parsePlan = (value: unknown): MovePlan | null => {
  if (!isRecord(value)) {
    return null;
  }
  const shares = isRecord(value.sourceShares)
    ? {
        sharedLinks: count(value.sourceShares.sharedLinks),
        spaces: count(value.sourceShares.spaces),
        sharedAlbums: count(value.sourceShares.sharedAlbums),
        memories: count(value.sourceShares.memories),
      }
    : null;
  return {
    items: count(value.items),
    groups: count(value.groups),
    bytes: count(value.bytes),
    new: count(value.new),
    present: count(value.present),
    held: count(value.held),
    liveVideos: count(value.liveVideos),
    stackMates: count(value.stackMates),
    gone: count(value.gone),
    notOwned: count(value.notOwned),
    remaining: count(value.remaining),
    sourceShares: shares,
  };
};

const parseFaces = (value: unknown): MoveFacesReport | null => {
  if (!isRecord(value)) {
    return null;
  }
  const people = Array.isArray(value.people) ? value.people.filter(isRecord) : [];
  const proposals = Array.isArray(value.proposals) ? value.proposals.filter(isRecord) : [];
  return {
    at: text(value.at),
    photos: count(value.photos),
    waiting: count(value.waiting),
    unmatched: count(value.unmatched),
    unassigned: count(value.unassigned),
    people: people
      .filter((person) => typeof person.id === 'string')
      .map((person) => ({
        id: person.id as string,
        named: person.named === true,
        hidden: person.hidden === true,
        faces: count(person.faces),
      })),
    proposals: proposals.flatMap((proposal): MoveFacesProposal[] => {
      if (typeof proposal.merge === 'string' && typeof proposal.into === 'string') {
        return [{ merge: proposal.merge, into: proposal.into }];
      }
      return typeof proposal.name === 'string' ? [{ name: proposal.name }] : [];
    }),
  };
};

/** A move's status as this page may use it, or nothing when the answer is not one. */
export const parseStatus = (value: unknown): MoveStatus | undefined => {
  if (!isRecord(value) || !isState(value.state)) {
    return;
  }
  const { move, source, destination } = value;
  if (typeof move !== 'string' || typeof source !== 'string' || typeof destination !== 'string') {
    return;
  }
  const person =
    isRecord(value.person) && typeof value.person.id === 'string'
      ? { id: value.person.id, name: text(value.person.name) || null, archived: value.person.archived === true }
      : null;
  const refusal =
    isRecord(value.refusal) && isSide(value.refusal.side) && typeof value.refusal.code === 'string'
      ? { side: value.refusal.side, code: value.refusal.code }
      : null;
  const space = isRecord(value.space) ? { needed: count(value.space.needed), free: count(value.space.free) } : null;
  const progress = isRecord(value.progress) ? value.progress : {};
  return {
    move,
    source,
    destination,
    person,
    state: value.state,
    phase: text(value.phase),
    reason: text(value.reason),
    needs: Array.isArray(value.needs) ? value.needs.filter(isSide) : [],
    refusal,
    plan: parsePlan(value.plan),
    holds: (Array.isArray(value.holds) ? value.holds.filter(isRecord) : [])
      .filter((hold) => typeof hold.reason === 'string')
      .map((hold) => ({ reason: hold.reason as string, items: count(hold.items), forceable: hold.forceable === true })),
    forced: texts(value.forced),
    progress: {
      moved: count(progress.moved),
      present: count(progress.present),
      copied: count(progress.copied),
      bothLibraries: count(progress.bothLibraries),
      bytes: count(progress.bytes),
    },
    space,
    trashDays: typeof value.trashDays === 'number' ? count(value.trashDays) : null,
    quiet: parseQuiet(value.quiet),
    key: text(value.key),
    held: (Array.isArray(value.held) ? value.held.filter(isRecord) : [])
      .filter((item) => typeof item.asset === 'string' && typeof item.reason === 'string')
      .slice(0, 1000)
      .map((item) => ({ asset: item.asset as string, reason: item.reason as string })),
    unfinished: texts(value.unfinished),
    faces: parseFaces(value.faces),
    createdAt: text(value.createdAt),
    updatedAt: text(value.updatedAt),
    endedAt: text(value.endedAt),
  };
};

const codeOf = (status: number, data: unknown): MoverErrorCode => {
  const named = isRecord(data) ? data.error : undefined;
  switch (status) {
    case 403: {
      return 'forbidden';
    }
    case 404: {
      return 'unknown';
    }
    case 409: {
      return named === 'busy' || named === 'exists' ? named : 'state';
    }
    case 503: {
      return 'stopping';
    }
    case 400:
    case 405:
    case 413:
    case 415: {
      return 'invalid';
    }
    default: {
      return 'failed';
    }
  }
};

type Answer = { status: number; data: unknown };

const call = async (path: string, body: object | undefined, timeoutMs: number): Promise<Answer> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    let response: Response;
    let data: unknown;
    try {
      // a CORS request, fetch's own mode: the receiver answers this origin only, and never with a credential
      response = await fetch(MOVER_ORIGIN + path, {
        method: body ? 'POST' : 'GET',
        credentials: 'omit',
        cache: 'no-store',
        redirect: 'error',
        referrerPolicy: 'no-referrer',
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify({ v: 1, ...body }) : undefined,
        signal: controller.signal,
      });
      data = await response.json().catch(() => {
        if (controller.signal.aborted) {
          throw new MoverError('unreachable');
        }
      });
    } catch {
      throw new MoverError('unreachable');
    }
    if (!response.ok) {
      throw new MoverError(codeOf(response.status, data), response.status);
    }
    return { status: response.status, data };
  } finally {
    clearTimeout(timer);
  }
};

const read = (path: string) => call(path, undefined, READ_TIMEOUT_MS);

/** A post the receiver takes answers 202 and owns what it carried from then on; any other answer is a refusal. */
const post = async (path: string, body: object) => {
  const answer = await call(path, body, POST_TIMEOUT_MS);
  if (answer.status !== 202) {
    throw new MoverError('failed', answer.status);
  }
  return answer.data;
};

const movePath = (id: string, tail = '') => {
  if (!MOVE_ID.test(id)) {
    throw new MoverError('invalid');
  }
  return `/v1/moves/${id}${tail}`;
};

/** The moves that involve this library: the one under way, and those that ended in the last 7 days. */
export const listMoves = async (): Promise<MoveStatus[]> => {
  const { data } = await read('/v1/moves');
  const moves = isRecord(data) && Array.isArray(data.moves) ? data.moves : [];
  return moves.map((move) => parseStatus(move)).filter((move): move is MoveStatus => !!move);
};

/** One move, as this library's side may see it. */
export const moveStatus = async (id: string): Promise<MoveStatus> => {
  const { data } = await read(movePath(id));
  const status = parseStatus(data);
  if (!status) {
    throw new MoverError('failed');
  }
  return status;
};

/** The source's hand-off (POST /v1/moves). Its 202 means the receiver checks the move, and owns the key. */
export const startMove = (handOff: MoveHandOff) => post('/v1/moves', handOff);

/** The destination's confirmation, with its key and the holds the owner moves anyway. */
export const confirmMove = async (id: string, key: MoveKey, force: readonly string[]) =>
  post(movePath(id, '/confirm'), { key, force });

/** A fresh key for a paused move that needs this side's. */
export const giveKey = async (id: string, side: MoveSide, key: MoveKey) => post(movePath(id, '/keys'), { side, key });

export const cancelMove = async (id: string) => post(movePath(id, '/cancel'), {});

/** Asks for a fresh face report of a person's move (the destination's, at most one a minute). */
export const askFaces = async (id: string) => post(movePath(id, '/faces'), {});
