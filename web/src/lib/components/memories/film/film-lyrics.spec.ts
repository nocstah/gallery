import { lyricAt, settledLyrics } from './film-lyrics';

const lines = [
  { at: 2, text: 'one' },
  { at: 5, text: '' },
  { at: 6, text: 'two' },
];

describe('lyricAt', () => {
  it('has the line being sung, and nothing before the first or in a gap', () => {
    expect(lyricAt(lines, 1)).toBe('');
    expect(lyricAt(lines, 2)).toBe('one');
    expect(lyricAt(lines, 5.5)).toBe('');
    expect(lyricAt(lines, 7)).toBe('two');
  });

  it('lets a line go when the singing has stopped for a long while', () => {
    expect(lyricAt(lines, 14)).toBe('two');
    expect(lyricAt(lines, 40)).toBe('');
  });

  it('has nothing for a song without lines', () => {
    expect(lyricAt([], 3)).toBe('');
  });
});

describe('settledLyrics', () => {
  it('moves a first line stamped in the intro to where the blank says the singing begins', () => {
    const settled = settledLyrics([
      { at: 7, text: 'one' },
      { at: 13, text: '' },
      { at: 20, text: 'two' },
    ]);
    expect(settled).toEqual([
      { at: 13, text: 'one' },
      { at: 20, text: 'two' },
    ]);
  });

  it('leaves a song alone when its first line runs straight into the next', () => {
    const lines = [
      { at: 7, text: 'one' },
      { at: 13, text: 'two' },
      { at: 20, text: '' },
      { at: 25, text: 'three' },
    ];
    expect(settledLyrics(lines)).toBe(lines);
    expect(settledLyrics([])).toEqual([]);
  });
});
