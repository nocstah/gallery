import { screen } from '@testing-library/svelte';
import { DateTime } from 'luxon';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { locale } from '$lib/stores/preferences.store';
import { relativeTime } from '$lib/utils/relative-time';
import { renderWithTooltips } from '$tests/helpers';
import MaintenanceBackupEntry from './MaintenanceBackupEntry.svelte';

vi.mock('$lib/services/database-backups.service', () => ({
  getDatabaseBackupActions: () => ({
    Download: { type: 'command', title: 'Download', onAction: vi.fn() },
    Delete: { type: 'command', title: 'Delete', onAction: vi.fn() },
  }),
  handleRestoreDatabaseBackup: vi.fn(),
}));

describe('MaintenanceBackupEntry', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-24T12:00:00Z'));
    locale.set('en');
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // Local Omarchy layer: the relative time is the calendar's (utils/relative-time), as every one in the app
  it('renders relative backup time using the user timezone instead of UTC', () => {
    const backupTimestamp = '20260324T110000';
    const since = (zone: string) =>
      relativeTime(
        DateTime.fromFormat(backupTimestamp, "yyyyMMdd'T'HHmmss", { zone }).toLocal().toMillis(),
        Date.now(),
        'en',
      );

    const expectedRelativeTime = since('Asia/Tokyo');
    const utcRelativeTime = since('UTC');

    expect(expectedRelativeTime).toBeTruthy();
    expect(expectedRelativeTime).not.toEqual(utcRelativeTime);

    renderWithTooltips(MaintenanceBackupEntry, {
      expectedVersion: '1.2.3',
      filename: 'immich-db-backup-20260324T110000-v1.2.3-snapshot.sql.gz',
      filesize: 1024,
      timezone: 'Asia/Tokyo',
    });

    expect(screen.getByText(expectedRelativeTime!)).toBeInTheDocument();
  });
});
