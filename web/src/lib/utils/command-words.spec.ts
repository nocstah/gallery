import { DateTime } from 'luxon';
import { backupCopy, backupWhen, databaseBackup } from '$lib/utils/command-words';

const now = DateTime.fromISO('2026-10-23T10:15:00');

describe('backupWhen', () => {
  it('calls the small hours and the evening before last night', () => {
    expect(backupWhen(DateTime.fromISO('2026-10-23T02:10:00'), now)).toBe('night');
    expect(backupWhen(DateTime.fromISO('2026-10-22T23:40:00'), now)).toBe('night');
  });

  it('says today, yesterday, or leaves it to the date', () => {
    expect(backupWhen(DateTime.fromISO('2026-10-23T08:00:00'), now)).toBe('today');
    expect(backupWhen(DateTime.fromISO('2026-10-22T14:00:00'), now)).toBe('yesterday');
    expect(backupWhen(DateTime.fromISO('2026-10-20T02:00:00'), now)).toBe('date');
  });
});

describe('databaseBackup', () => {
  const item = (value: number | null, detail: string, attention = false) => ({
    key: 'backup',
    title: 'Last database backup',
    value,
    attention,
    detail,
    link: null,
  });

  it("takes the dump's own time from its name while it agrees with its age", () => {
    const facts = databaseBackup(item(8, 'immich-db-backup-20261023T020000-v5.9.0-pg14.19.sql.gz, 8 hours ago.'), now);
    expect(facts.state).toBe('ok');
    expect(facts.at?.toFormat('yyyy-LL-dd HH:mm')).toBe('2026-10-23 02:00');
  });

  it('goes by the age where the name says something else, or nothing', () => {
    expect(databaseBackup(item(3, 'immich-db-backup-20261023T020000.sql.gz'), now).at?.toFormat('HH:mm')).toBe('07:15');
    expect(databaseBackup(item(3, 'dump.sql.gz, 3 hours ago.'), now).at?.toFormat('HH:mm')).toBe('07:15');
  });

  it('marks a backup older than Curator likes, and none at all', () => {
    expect(databaseBackup(item(50, 'x.sql.gz', true), now).state).toBe('stale');
    expect(databaseBackup(item(null, 'No database backup found.', true), now)).toEqual({ state: 'none' });
    expect(databaseBackup(undefined, now)).toEqual({ state: 'none' });
  });
});

describe('backupCopy', () => {
  it('reads a copy that went well, failed, is old, never ran or is not set up', () => {
    expect(backupCopy({ ok: true, last_ok: '2026-10-23T02:30:00', error: null }, now).state).toBe('ok');
    expect(backupCopy({ ok: false, last_ok: '2026-10-21T02:30:00', error: 'disk full' }, now)).toMatchObject({
      state: 'failed',
    });
    expect(backupCopy({ ok: true, last_ok: '2026-10-19T02:30:00', error: null }, now).state).toBe('stale');
    expect(backupCopy({ ok: null, last_ok: null, error: null }, now).state).toBe('none');
    expect(backupCopy({ ok: null, last_ok: null, error: null, configured: false }, now).state).toBe('unset');
  });
});
