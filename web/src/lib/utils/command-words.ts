// Local Omarchy layer: the Command center's backups in words ("Last night's backup to the My Book: fine, 02:10"),
// where it showed the database dump's file name and "OK, Oct 23, 02:30 AM". Times are the reader's calendar days.
import { DateTime } from 'luxon';
import type { BackupCopy, HealthItem } from '$lib/utils/curator';

/** a run's time as a person says it the morning after: before 06:00 today or from 18:00 yesterday is last night */
export type BackupWhen = 'night' | 'today' | 'yesterday' | 'date';

export const backupWhen = (at: DateTime, now: DateTime = DateTime.now()): BackupWhen => {
  const days = Math.round(now.startOf('day').diff(at.startOf('day'), 'days').days);
  if (days === 0) {
    return at.hour < 6 ? 'night' : 'today';
  }
  if (days === 1) {
    return at.hour >= 18 ? 'night' : 'yesterday';
  }
  return 'date';
};

/** what a backup's words need: how it stands, and when it last went well */
export type BackupFacts = {
  state: 'ok' | 'failed' | 'stale' | 'none' | 'unset';
  /** the last good run */
  at?: DateTime;
};

// the database dumps are named by when they were made, on the server's clock: immich-db-backup-20261023T020000-…
const dumpTime = (detail: string) => {
  const match = /db-backup-(\d{8}T\d{6})/.exec(detail);
  const at = match ? DateTime.fromFormat(match[1], "yyyyLLdd'T'HHmmss") : undefined;
  return at?.isValid ? at : undefined;
};

/** Gallery's database backup, from Curator's health item: its age in hours (`value`), its file's name in `detail`, a
 * look needed (`attention`) past a day and a half. The time in the file's name is the exact one, while it agrees
 * with the age (a server on another clock would not). */
export const databaseBackup = (item: HealthItem | undefined, now: DateTime = DateTime.now()): BackupFacts => {
  if (!item || item.value === null) {
    return { state: 'none' };
  }
  const byAge = now.minus({ hours: item.value });
  const byName = dumpTime(item.detail);
  const at = byName && Math.abs(byName.diff(byAge, 'hours').hours) <= 2 ? byName : byAge;
  return { state: item.attention ? 'stale' : 'ok', at };
};

/** a copy of the backups (the disk's every night, the off-site one once it is set up), as curator-health saw it */
export const backupCopy = (
  copy: (BackupCopy & { configured?: boolean }) | undefined,
  now: DateTime = DateTime.now(),
): BackupFacts => {
  if (!copy || copy.configured === false) {
    return { state: 'unset' };
  }
  const at = copy.last_ok ? DateTime.fromISO(copy.last_ok) : undefined;
  if (copy.ok === false) {
    return { state: 'failed', at };
  }
  if (!at) {
    return { state: 'none' };
  }
  // three days without a good run is worth a look (curator-health says so)
  return { state: at < now.minus({ days: 3 }) ? 'stale' : 'ok', at };
};
