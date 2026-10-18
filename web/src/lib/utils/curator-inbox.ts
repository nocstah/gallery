import type { Translations } from 'svelte-i18n';
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
  /** the kind of change its batches hold (Curator's action kind: asset.archive), which says what accepting does */
  kind: string;
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
      kind: words.kind,
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

// ---- what accepting does, in words ----
// A kind's row and its buttons say what accepting does, a verb and what it counts, in the owner's plain voice
// ("Archive 42 clips", "Publish 120 restored versions", "Make 16 albums"), where they had said Accept, the same word
// for archiving clips, publishing restored versions and making albums. The verb follows Curator's kind of change
// (curator/actions*.py: @action), its object the batch's series where one kind of change holds different things
// (restore.publish:collages are collages, restore.publish:prints restored versions).

/** what accepting a kind does: one verb per kind of change */
export type InboxVerb =
  | 'accept'
  | 'album'
  | 'apply'
  | 'archive'
  | 'cover'
  | 'date'
  | 'describe'
  | 'hide'
  | 'icon'
  | 'lock'
  | 'make'
  | 'merge'
  | 'name'
  | 'place'
  | 'publish'
  | 'qr'
  | 'rename'
  | 'rotate'
  | 'stack'
  | 'tag'
  | 'untag';

/** the words for one verb: a card's button (and the A key), and the button that does every waiting one at once */
const VERBS: Record<InboxVerb, { button: Translations; all: Translations }> = {
  accept: { button: 'ai_inbox_verb_accept', all: 'ai_inbox_verb_accept_all' },
  album: { button: 'ai_inbox_verb_album', all: 'ai_inbox_verb_album_all' },
  apply: { button: 'ai_inbox_verb_apply', all: 'ai_inbox_verb_apply_all' },
  archive: { button: 'ai_inbox_verb_archive', all: 'ai_inbox_verb_archive_all' },
  cover: { button: 'ai_inbox_verb_cover', all: 'ai_inbox_verb_cover_all' },
  date: { button: 'ai_inbox_verb_date', all: 'ai_inbox_verb_date_all' },
  describe: { button: 'ai_inbox_verb_describe', all: 'ai_inbox_verb_describe_all' },
  hide: { button: 'ai_inbox_verb_hide', all: 'ai_inbox_verb_hide_all' },
  icon: { button: 'ai_inbox_verb_icon', all: 'ai_inbox_verb_icon_all' },
  lock: { button: 'ai_inbox_verb_lock', all: 'ai_inbox_verb_lock_all' },
  make: { button: 'ai_inbox_verb_make', all: 'ai_inbox_verb_make_all' },
  merge: { button: 'ai_inbox_verb_merge', all: 'ai_inbox_verb_merge_all' },
  name: { button: 'ai_inbox_verb_name', all: 'ai_inbox_verb_name_all' },
  place: { button: 'ai_inbox_verb_place', all: 'ai_inbox_verb_place_all' },
  publish: { button: 'ai_inbox_verb_publish', all: 'ai_inbox_verb_publish_all' },
  qr: { button: 'ai_inbox_verb_qr', all: 'ai_inbox_verb_qr_all' },
  rename: { button: 'ai_inbox_verb_rename', all: 'ai_inbox_verb_rename_all' },
  rotate: { button: 'ai_inbox_verb_rotate', all: 'ai_inbox_verb_rotate_all' },
  stack: { button: 'ai_inbox_verb_stack', all: 'ai_inbox_verb_stack_all' },
  tag: { button: 'ai_inbox_verb_tag', all: 'ai_inbox_verb_tag_all' },
  untag: { button: 'ai_inbox_verb_untag', all: 'ai_inbox_verb_untag_all' },
};

/** a verb with what it counts: the kind's row ("Archive 42 clips") and the line after it is done ("Archived 42 clips.") */
const WHAT = {
  accept_suggestions: ['accept', 'ai_inbox_do_accept_suggestions', 'ai_inbox_did_accept_suggestions'],
  album_albums: ['album', 'ai_inbox_do_album_albums', 'ai_inbox_did_album_albums'],
  album_smart: ['album', 'ai_inbox_do_album_smart', 'ai_inbox_did_album_smart'],
  apply_changes: ['apply', 'ai_inbox_do_apply_changes', 'ai_inbox_did_apply_changes'],
  archive_clips: ['archive', 'ai_inbox_do_archive_clips', 'ai_inbox_did_archive_clips'],
  archive_photos: ['archive', 'ai_inbox_do_archive_photos', 'ai_inbox_did_archive_photos'],
  archive_screenshots: ['archive', 'ai_inbox_do_archive_screenshots', 'ai_inbox_did_archive_screenshots'],
  cover_stacks: ['cover', 'ai_inbox_do_cover_stacks', 'ai_inbox_did_cover_stacks'],
  date_photos: ['date', 'ai_inbox_do_date_photos', 'ai_inbox_did_date_photos'],
  describe_photos: ['describe', 'ai_inbox_do_describe_photos', 'ai_inbox_did_describe_photos'],
  hide_groups: ['hide', 'ai_inbox_do_hide_groups', 'ai_inbox_did_hide_groups'],
  icon_faces: ['icon', 'ai_inbox_do_icon_faces', 'ai_inbox_did_icon_faces'],
  lock_photos: ['lock', 'ai_inbox_do_lock_photos', 'ai_inbox_did_lock_photos'],
  make_animations: ['make', 'ai_inbox_do_make_animations', 'ai_inbox_did_make_animations'],
  make_collages: ['make', 'ai_inbox_do_make_collages', 'ai_inbox_did_make_collages'],
  make_effects: ['make', 'ai_inbox_do_make_effects', 'ai_inbox_did_make_effects'],
  merge_people: ['merge', 'ai_inbox_do_merge_people', 'ai_inbox_did_merge_people'],
  merge_pets: ['merge', 'ai_inbox_do_merge_pets', 'ai_inbox_did_merge_pets'],
  name_people: ['name', 'ai_inbox_do_name_people', 'ai_inbox_did_name_people'],
  place_photos: ['place', 'ai_inbox_do_place_photos', 'ai_inbox_did_place_photos'],
  publish_clips: ['publish', 'ai_inbox_do_publish_clips', 'ai_inbox_did_publish_clips'],
  publish_reels: ['publish', 'ai_inbox_do_publish_reels', 'ai_inbox_did_publish_reels'],
  publish_restored: ['publish', 'ai_inbox_do_publish_restored', 'ai_inbox_did_publish_restored'],
  publish_versions: ['publish', 'ai_inbox_do_publish_versions', 'ai_inbox_did_publish_versions'],
  qr_photos: ['qr', 'ai_inbox_do_qr_photos', 'ai_inbox_did_qr_photos'],
  rename_albums: ['rename', 'ai_inbox_do_rename_albums', 'ai_inbox_did_rename_albums'],
  rotate_photos: ['rotate', 'ai_inbox_do_rotate_photos', 'ai_inbox_did_rotate_photos'],
  stack_copies: ['stack', 'ai_inbox_do_stack_copies', 'ai_inbox_did_stack_copies'],
  tag_photos: ['tag', 'ai_inbox_do_tag_photos', 'ai_inbox_did_tag_photos'],
  untag_tags: ['untag', 'ai_inbox_do_untag_tags', 'ai_inbox_did_untag_tags'],
} satisfies Record<string, [InboxVerb, Translations, Translations]>;
type What = keyof typeof WHAT;

/** a series whose things are not what its kind of change usually holds */
const BY_SERIES: Record<string, What> = {
  'asset.archive:short': 'archive_clips',
  'asset.archive:screenshot': 'archive_screenshots',
  'person.merge:pets': 'merge_pets',
  'restore.publish:animations': 'make_animations',
  'restore.publish:collages': 'make_collages',
  'restore.publish:live': 'make_effects',
  'restore.publish:prints': 'publish_restored',
  'restore.publish:videos': 'publish_clips',
};

/** Curator's kinds of change (a batch's kind; "agent" is the chat's batch, which holds any of them) */
const BY_KIND: Record<string, What> = {
  agent: 'apply_changes',
  'album.create': 'album_albums',
  'album.rename': 'rename_albums',
  'asset.archive': 'archive_photos',
  'asset.date': 'date_photos',
  'asset.date-shift': 'date_photos',
  'asset.describe': 'describe_photos',
  'asset.location': 'place_photos',
  'asset.lock': 'lock_photos',
  'asset.rotate': 'rotate_photos',
  'asset.tag': 'tag_photos',
  'person.hide': 'hide_groups',
  'person.merge': 'merge_people',
  'person.name': 'name_people',
  'person.portrait': 'icon_faces',
  'qr.file': 'qr_photos',
  'reel.publish': 'publish_reels',
  'restore.publish': 'publish_versions',
  'smart.create': 'album_smart',
  'stack.cover': 'cover_stacks',
  'stack.create': 'stack_copies',
  'tag.retire': 'untag_tags',
};

export type KindAction = {
  verb: InboxVerb;
  /** a card's button and the A key: "Archive" */
  button: Translations;
  /** every waiting one at once: "Archive all {count}" */
  all: Translations;
  /** the kind's row: "Archive {count} clips" */
  todo: Translations;
  /** once done: "Archived {count} clips." */
  done: Translations;
};

/** What accepting does for a kind (its series, and Curator's kind of change), in words; Accept where it is not known. */
export const kindAction = (series: string, kind: string): KindAction => {
  const what = BY_SERIES[series] ?? BY_KIND[kind] ?? 'accept_suggestions';
  const [verb, todo, done] = WHAT[what];
  return { verb, ...VERBS[verb], todo, done };
};

/** Every message the inbox's words for a kind can take, for the translations' tests. */
export const kindActionKeys = (): Translations[] => [
  ...Object.values(VERBS).flatMap(({ button, all }) => [button, all]),
  ...Object.values(WHAT).flatMap(([, todo, done]) => [todo, done]),
];
