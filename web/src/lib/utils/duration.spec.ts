import { formatDuration } from '$lib/utils/duration';

describe('formatDuration', () => {
  it('writes m:ss under an hour, whatever the minutes', () => {
    expect(formatDuration(18)).toBe('0:18');
    expect(formatDuration(76)).toBe('1:16');
    expect(formatDuration(600)).toBe('10:00');
    expect(formatDuration(3599)).toBe('59:59');
  });

  it('writes h:mm:ss from an hour on', () => {
    expect(formatDuration(3600)).toBe('1:00:00');
    expect(formatDuration(3723)).toBe('1:02:03');
    expect(formatDuration(36_000 + 59)).toBe('10:00:59');
  });

  it('leaves a fraction of a second off, as a clock does', () => {
    expect(formatDuration(18.9)).toBe('0:18');
    expect(formatDuration(59.99)).toBe('0:59');
  });

  it('writes nothing it cannot measure as no time at all', () => {
    expect(formatDuration(0)).toBe('0:00');
    expect(formatDuration(-4)).toBe('0:00');
    expect(formatDuration(NaN)).toBe('0:00');
    expect(formatDuration(Infinity)).toBe('0:00');
  });
});
