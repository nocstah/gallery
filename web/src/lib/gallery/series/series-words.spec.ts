import fs from 'node:fs';
import path from 'node:path';
import { FORK_LOCALES } from '$lib/i18n/fork-locales';

// Local Omarchy layer: the words of "From the beginning" (gallery/series, and its family page in the public player,
// memory-player/src/series) all come from i18n keys: no component of either writes a word of its own, in its markup or
// in an attribute a person reads or hears, and every memory_series_ key they use is in English and the nine maintained
// locales, none left over.

const MODULE = path.resolve(process.cwd(), 'src/lib/gallery/series');
const FAMILY = path.resolve(process.cwd(), 'memory-player/src/series');
const SRC = path.resolve(process.cwd(), 'src');
const PLAYER = path.resolve(process.cwd(), 'memory-player/src');
const OVERLAY = path.resolve(process.cwd(), '../i18n/gallery');

const componentsIn = (directory: string) =>
  fs
    .readdirSync(directory)
    .filter((name) => name.endsWith('.svelte') && !name.endsWith('.test-wrapper.svelte'))
    .map((name) => path.relative(process.cwd(), path.join(directory, name)));
const components = [...componentsIn(MODULE), ...componentsIn(FAMILY)];

/** the markup with every {…} taken out (blocks and expressions, braces counted so nested ones go too) */
const withoutExpressions = (markup: string) => {
  let out = '';
  let depth = 0;
  for (const character of markup) {
    if (character === '{') {
      depth++;
    } else if (character === '}') {
      depth = Math.max(0, depth - 1);
    } else if (depth === 0) {
      out += character;
    }
  }
  return out;
};

const markupOf = (source: string) =>
  withoutExpressions(
    source
      .replaceAll(/<script[\s\S]*?<\/script>/g, '')
      .replaceAll(/<style[\s\S]*?<\/style>/g, '')
      .replaceAll(/<!--[\s\S]*?-->/g, ''),
  );

/** the words a component writes of its own: between its tags, and in what a person reads or hears of an element */
const ownWords = (source: string) => {
  const markup = markupOf(source);
  const between = markup
    .replaceAll(/<[^>]*>/g, '\n')
    .split('\n')
    .map((text) => text.trim())
    .filter((text) => /\p{L}/u.test(text));
  const said = [...markup.matchAll(/\s(aria-label|aria-description|title|alt|placeholder)="([^"]*)"/g)]
    .filter((match) => /\p{L}/u.test(match[2]))
    .map(([, attribute]) => attribute);
  return [...between, ...said];
};

const sourcesUnder = (directory: string): string[] =>
  fs
    .readdirSync(directory, { recursive: true, encoding: 'utf8' })
    .filter((name) => /\.(svelte|ts)$/.test(name) && !name.endsWith('.spec.ts'))
    .map((name) => fs.readFileSync(path.join(directory, name), 'utf8'));

const read = (locale: string) =>
  JSON.parse(fs.readFileSync(path.join(OVERLAY, `${locale}.json`), 'utf8')) as Record<string, unknown>;

describe('the words of From the beginning', () => {
  it('finds its components, and a word written into markup (controls)', () => {
    expect(components.map((name) => path.basename(name))).toEqual(
      expect.arrayContaining([
        'SeriesPage.svelte',
        'SeriesDay.svelte',
        'SeriesSwapSheet.svelte',
        'SeriesFamily.svelte',
        'SeriesSent.svelte',
        'SeriesFamilyPage.svelte',
        'SeriesFamilyGrid.svelte',
        'SeriesFamilyClip.svelte',
      ]),
    );
    const sample = [
      '<script lang="ts">const label = $t("memory_series_play");</script>',
      '<button type="button" aria-label="Close" title={label}>Play</button>',
      '<p>{$t("memory_series_skip", { values: { name: "Anna" } })} · {count}</p>',
      '<style>.a { content: "Skip"; }</style>',
    ].join('\n');
    expect(ownWords(sample)).toEqual(['Play', 'aria-label']);
  });

  it.each(components)('%s writes no word of its own', (name) => {
    expect(ownWords(fs.readFileSync(path.resolve(process.cwd(), name), 'utf8'))).toEqual([]);
  });

  it('has every key it uses in English and the nine maintained locales, and no other', () => {
    const used = new Set(
      [...sourcesUnder(SRC), ...sourcesUnder(PLAYER)].flatMap((source) => source.match(/memory_series_[a-z_]+/g) ?? []),
    );
    const english = Object.keys(read('en')).filter((key) => key.startsWith('memory_series_'));
    expect(used.size).toBeGreaterThan(20);
    const inOrder = (keys: Iterable<string>) => [...keys].sort((a, b) => a.localeCompare(b));
    expect(inOrder(used)).toEqual(inOrder(english));
    for (const locale of FORK_LOCALES) {
      const translated = read(locale);
      const missing = english.filter((key) => typeof translated[key] !== 'string' || translated[key] === '');
      expect(missing, locale).toEqual([]);
    }
  });
});
