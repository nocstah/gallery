import { curator, type InboxGroup, type Suggestion } from '$lib/utils/curator';

// Local Omarchy layer: the AI inbox by kind. Curator keys a batch by what it holds and the day its run made it
// (restore.publish:prints:2026-10-18); the key without the day is the batch's series, its kind. Curator adds a night's
// proposals to the batch of their kind that still waits (curator/jobs/__init__.py, JobContext.group), and the batches
// it made one per night before that read as one kind here too: one row per kind with its counts summed, the days of
// its runs, the one waiting longest first, and one queue to review across its batches.

const RUN_DAY = /:(\d{4}-\d{2}-\d{2})$/;

/** A batch's kind: its key without the day of the run that made it (Curator's jobs.series). */
export const seriesOf = (key: string) => key.replace(RUN_DAY, '');

export type InboxKind = {
  series: string;
  /** its batches, the one waiting longest first */
  keys: string[];
  /** the newest batch's words: a job's later runs may say it better */
  title: string;
  description: string | null;
  pending: number;
  applied: number;
  rejected: number;
  /** the days its waiting proposals were made ('YYYY-MM-DD'), oldest first */
  runs: string[];
  /** when the first of them was (ISO) */
  oldest: string;
  preview: string[];
};

/** an instant's day where the browser is, 'YYYY-MM-DD' */
const localDay = (iso: string) => {
  const at = new Date(iso);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`;
};

/** The days of a batch's runs: Curator's (the days its waiting proposals were made), else the day in its key, else the
 * day it was made (a Curator from before it said). */
export const runsOf = (batch: { key: string; created_at?: string; runs?: string[] | null }): string[] => {
  if (batch.runs && batch.runs.length > 0) {
    return batch.runs;
  }
  const day = RUN_DAY.exec(batch.key)?.[1];
  return day ? [day] : batch.created_at ? [localDay(batch.created_at)] : [];
};

/** The batch made last, whose title and description are the newest words for its kind. */
export const newestBatch = <T extends { created_at?: string }>(batches: T[]): T => {
  let best = batches[0];
  for (const batch of batches) {
    if ((batch.created_at ?? '') > (best.created_at ?? '')) {
      best = batch;
    }
  }
  return best;
};

/** One kind per series, its batches' counts summed, the one waiting longest first. */
export const kindsOf = (groups: InboxGroup[]): InboxKind[] => {
  const bySeries = new Map<string, InboxGroup[]>();
  for (const group of groups) {
    const series = group.series ?? seriesOf(group.key);
    bySeries.set(series, [...(bySeries.get(series) ?? []), group]);
  }
  const oldest = (group: InboxGroup) => group.oldest ?? group.created_at;
  const kinds = [...bySeries].map(([series, batches]): InboxKind => {
    batches.sort((a, b) => oldest(a).localeCompare(oldest(b)) || a.key.localeCompare(b.key));
    const words = newestBatch(batches);
    return {
      series,
      keys: batches.map((batch) => batch.key),
      title: words.title,
      description: words.description,
      pending: batches.reduce((sum, batch) => sum + batch.pending, 0),
      applied: batches.reduce((sum, batch) => sum + batch.applied, 0),
      rejected: batches.reduce((sum, batch) => sum + batch.rejected, 0),
      runs: [...new Set(batches.flatMap((batch) => runsOf(batch)))].sort(),
      oldest: oldest(batches[0]),
      preview: [...new Set(batches.flatMap((batch) => batch.preview ?? []))].slice(0, 8),
    };
  });
  return kinds.sort((a, b) => a.oldest.localeCompare(b.oldest) || a.series.localeCompare(b.series));
};

/** The inbox's address for reviewing a kind: each of its batches. */
export const kindQuery = (keys: string[]) => new URLSearchParams(keys.map((key) => ['group', key])).toString();

/**
 * The days of a kind's runs, short, in the reader's language: the month once for days in the same month ("Oct 15 · 16 ·
 * 18", "Sep 30 · Oct 2"), the year where it is not this one, and past four days the first and the last two around an
 * ellipsis.
 */
export const runDays = (runs: string[], locale?: string, today = new Date()): string => {
  const days = runs.map((run) => {
    const [year, month, day] = run.split('-').map(Number);
    return new Date(year, month - 1, day);
  });
  const shown: (Date | null)[] = days.length > 4 ? [days[0], null, ...days.slice(-2)] : days;
  const full = new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric' });
  const fullYear = new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric', year: 'numeric' });
  // the day as the full date writes it, with what marks it there ("16." in German, "16日" in Chinese)
  const dayOnly = (day: Date) => {
    const parts = full.formatToParts(day);
    const at = parts.findIndex((part) => part.type === 'day');
    const mark = parts[at + 1]?.type === 'literal' ? parts[at + 1].value.trim() : '';
    return parts[at].value + mark;
  };
  let before: Date | undefined;
  const parts = shown.map((day) => {
    if (!day) {
      before = undefined;
      return '…';
    }
    const sameMonth = before && before.getFullYear() === day.getFullYear() && before.getMonth() === day.getMonth();
    const otherYear = day.getFullYear() !== today.getFullYear() && before?.getFullYear() !== day.getFullYear();
    before = day;
    if (sameMonth) {
      return dayOnly(day);
    }
    return (otherYear ? fullYear : full).format(day);
  });
  return parts.join(' · ');
};

const byConfidence = (a: Suggestion, b: Suggestion) => (b.confidence ?? -1) - (a.confidence ?? -1) || a.id - b.id;

/** Every waiting suggestion of a kind's batches, as one queue in Curator's own order (most confident first). */
export const waitingIn = async (keys: string[]): Promise<Suggestion[]> => {
  const all: Suggestion[] = [];
  for (const key of keys) {
    // Curator answers at most 500 at a time
    for (let offset = 0; ; offset += 500) {
      const page = await curator.group(key, 'pending', 500, offset);
      all.push(...page.items);
      if (page.items.length < 500 || offset + 500 >= page.total) {
        break;
      }
    }
  }
  return all.sort(byConfidence);
};

/** Suggestions of several batches merged into one queue, in Curator's own order. */
export const queueOrder = (items: Suggestion[]) => [...items].sort(byConfidence);
