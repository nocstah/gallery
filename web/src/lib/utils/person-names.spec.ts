import { isRepeatedName, nameKey, personSpanLine, repeatedNames } from '$lib/utils/person-names';

// Local Omarchy layer: telling apart people who bear the same name (DESIGN.md, People)
describe(repeatedNames.name, () => {
  it('finds the names more than one person bears, however they are written', () => {
    const repeated = repeatedNames([
      { name: 'Daniel' },
      { name: 'daniel ' },
      { name: 'Anders' },
      { name: 'Ánders' },
      { name: 'Kim' },
    ]);
    expect(repeated).toEqual(new Set([nameKey('Daniel'), nameKey('Anders')]));
    expect(isRepeatedName(repeated, 'DANIEL')).toBe(true);
    expect(isRepeatedName(repeated, 'Kim')).toBe(false);
  });

  it('never counts people without a name as sharing one', () => {
    expect(repeatedNames([{ name: '' }, { name: '  ' }, { name: '' }]).size).toBe(0);
  });
});

describe(personSpanLine.name, () => {
  it('says how many photos and the years they span, in the reader’s digits', () => {
    expect(personSpanLine({ count: 2318, first: 2008, last: 2026 }, 2400, 'en')).toBe('2,318 · 2008–2026');
    expect(personSpanLine({ count: 2318, first: 2008, last: 2026 }, 2400, 'de')).toBe('2.318 · 2008–2026');
    expect(personSpanLine({ count: 4, first: 2019, last: 2019 }, 4, 'en')).toBe('4 · 2019');
  });

  it('says nothing while the years are being asked for', () => {
    expect(personSpanLine(undefined, 140, 'en')).toBeUndefined();
  });

  it('falls back to the count Gallery lists them with when their timeline gives nothing', () => {
    expect(personSpanLine(null, 140, 'en')).toBe('140');
    expect(personSpanLine({ count: 0, first: 0, last: 0 }, 3, 'en')).toBe('3');
    expect(personSpanLine(null, undefined, 'en')).toBeUndefined();
  });
});
