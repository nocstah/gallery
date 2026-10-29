import { IntlMessageFormat } from 'intl-messageformat';
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { FORK_LOCALES } from '$lib/i18n/fork-locales';
import { convertBCP47 } from '$lib/utils/i18n';

// Local Omarchy layer: the words for Curator not answering name the port it is expected on (utils/curator's
// curatorPort): Main's 2290, or the one a library with a Curator of its own names (gallery/libraries). The pages'
// tests render English; this reads the nine maintained translations too, and every place in the app that says the
// words, which has to give them the port: without it they show "{port}" as it is.

const I18N_DIR = path.resolve(process.cwd(), '../i18n/gallery/merged');
const SRC_DIR = path.resolve(process.cwd(), 'src');
const KEYS = ['ai_inbox_offline_body', 'chat_offline_body'];

const read = (code: string) =>
  JSON.parse(fs.readFileSync(path.join(I18N_DIR, `${code}.json`), 'utf8')) as Record<string, string>;

describe.each(['en', ...FORK_LOCALES])('%s', (code) => {
  const messages = read(code);

  it.each(KEYS)('%s names the port it is given, and no other', (key) => {
    const message = messages[key];
    expect(message, `${code}.json has no ${key}`).toBeTypeOf('string');
    expect(message).not.toContain('2290');

    const said = String(new IntlMessageFormat(message, convertBCP47(code)).format({ port: 2291 }));
    expect(said).toContain('2291');
    expect(said).not.toMatch(/[{}]/);
  });
});

describe('every place that says Curator is not answering', () => {
  it('gives the words the port', () => {
    const places: string[] = [];
    const withoutPort: string[] = [];
    for (const name of fs.readdirSync(SRC_DIR, { recursive: true, encoding: 'utf8' })) {
      if (!/\.(svelte|ts)$/.test(name) || name.endsWith('.spec.ts')) {
        continue;
      }
      const source = fs.readFileSync(path.join(SRC_DIR, name), 'utf8');
      for (const [, key, rest] of source.matchAll(/\(\s*'(ai_inbox_offline_body|chat_offline_body)'([^)]*)/g)) {
        places.push(`${name}: ${key}`);
        if (!/values:\s*\{\s*port:/.test(rest)) {
          withoutPort.push(`${name}: ${key}`);
        }
      }
    }

    // control: the AI inbox, Ask, the chat and the bank slips say them
    expect(places.length).toBeGreaterThanOrEqual(4);
    expect(withoutPort).toEqual([]);
  });
});
