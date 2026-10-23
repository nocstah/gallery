#!/usr/bin/env node
// Local Omarchy layer: the engine behind apply-kioku.sh and verify-kioku.sh (README.md beside them says what they do
// and why). Node only, no dependencies, like i18n/gallery/merge.mjs; the words and the i18n classification it works by
// are brand.json's, and the names it replaces are the ones Noodle's apply-branding.sh wrote (branding/config.json).
//
//   node kioku.mjs rewrite <root> <file> <count>   a literal rewrite of <root>/<file>, its rule on stdin: the old text,
//                                                  a line "=>", the new text (@NAME@ and the like from brand.json)
//   node kioku.mjs i18n <i18n dir>                 name the folded bundle Kioku by brand.json's classification
//   node kioku.mjs verify <copy root | output>     list every brand name left where people see it; exit 1 on one that
//                                                  is not on the keep list
//
// Every rewrite checks that it found what it was written against, as often as it was, and stops otherwise, naming the
// file and the text: after a rebase, a rule that quietly matched nothing would ship the old name.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import zlib from 'node:zlib';

class Stop extends Error {}
const stop = (message) => {
  throw new Stop(message);
};

const here = path.dirname(fileURLToPath(import.meta.url));
const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const brand = readJson(path.join(here, 'brand.json'));
const noodle = readJson(path.join(here, '..', 'config.json'));

const NAME = brand.name;
const NOODLE = noodle.name; // what apply-branding.sh calls it: Noodle Gallery
const NOODLE_JOINED = NOODLE.replaceAll(' ', ''); // as in the phone's DCIM/NoodleGallery
const SHORT = noodle.name_short; // Gallery, which the overlay's own strings use bare
const UPSTREAM = noodle.upstream_name; // Immich
const UPSTREAM_LOWER = UPSTREAM.toLowerCase();
const CREDIT = brand.about_credit;

// The words brand.json puts into code (a Svelte string, a template literal, an alt attribute) hold nothing that could
// end the string there or start markup or an expression.
const UNSAFE = /[`'"\\$<>{}]/;
for (const [what, value] of [
  ['name', brand.name],
  ['short_name', brand.short_name],
  ['inspector_title', brand.inspector_title],
  ['logo_alt', brand.logo_alt],
  ['memory_player.page_title', brand.memory_player.page_title],
  ['memory_player.memory_title', brand.memory_player.memory_title.replace('{title}', '')],
  ['about_credit.key', CREDIT.key],
  ['phone_app_icon.target', brand.phone_app_icon.target],
]) {
  if (typeof value !== 'string' || !value.trim() || UNSAFE.test(value)) {
    stop(
      `brand.json ${what}: a word with no quotes, backticks, $, <, >, braces or backslashes, ` +
        `not ${JSON.stringify(value)}`,
    );
  }
}
if (brand.memory_player.memory_title.split('{title}').length !== 2) {
  stop("brand.json memory_player.memory_title: has {title} exactly once, where the memory's own title goes");
}
if (!/^[a-z][a-z0-9_]*$/.test(CREDIT.key) || typeof CREDIT.text?.en !== 'string') {
  stop('brand.json about_credit: a top-level snake_case key and an English text at least');
}

const count = (text, part) => (part ? text.split(part).length - 1 : 0);
const clip = (text, length = 90) => {
  const flat = text.replaceAll('\n', '⏎');
  return flat.length > length ? `${flat.slice(0, length - 1)}…` : flat;
};
const escapeRegExp = (text) => text.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);

// ---- rewrite: one literal rule from apply-kioku.sh ----

const placeholders = {
  NAME,
  NOODLE,
  SHORT,
  UPSTREAM,
  INSPECTOR_TITLE: brand.inspector_title,
  LOGO_ALT: brand.logo_alt,
  MEMORY_PAGE_TITLE: brand.memory_player.page_title,
  CREDIT_KEY: CREDIT.key,
  // where web/static/ is served: the site's root
  PHONE_APP_ICON: `/${path.posix.relative('web/static', brand.phone_app_icon.target)}`,
};
// @NAME@, or @MEMORY_TITLE[expression]@: the memory title's pattern with the code's own expression for {title}
const fill = (text) =>
  text.replaceAll(/@([A-Z_]+)(?:\[([^\]]*)\])?@/g, (all, key, argument) => {
    if (key === 'MEMORY_TITLE' && argument !== undefined) {
      return brand.memory_player.memory_title.replace('{title}', argument);
    }
    if (Object.hasOwn(placeholders, key) && argument === undefined) {
      return placeholders[key];
    }
    stop(`a rule names ${all}, which brand.json does not fill`);
  });

const rewrite = (root, file, wanted, rule) => {
  const parts = rule.replace(/\n$/, '').split('\n=>\n');
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    stop(`${file}: a rule is the old text, a line "=>", then the new text`);
  }
  const [before, after] = parts.map(fill);
  const target = path.join(root, file);
  if (!fs.existsSync(target)) {
    stop(`${file}: not in the copy any more (upstream moved it): update the rule in apply-kioku.sh`);
  }
  const text = fs.readFileSync(target, 'utf8');
  const found = count(text, before);
  const done = count(text, after);
  // a second run finds the new text where the old was (an insertion's new text holds the old one: it counts first)
  if (after.includes(before) ? done === wanted : found === 0 && done >= wanted) {
    console.log(`  already  ${file}: «${clip(after)}»`);
    return;
  }
  if (found !== wanted) {
    stop(
      `${file}: expected «${clip(before, 160)}» ${wanted}×, found it ${found}× (and the Kioku text ${done}×). ` +
        'Upstream changed this text: update the rule in branding/kioku/apply-kioku.sh.',
    );
  }
  const out = text.split(before).join(after);
  if (!after.includes(before) && count(out, before) > 0) {
    stop(
      `${file}: the new text «${clip(after)}» makes the old one again where it joins; write the rule with more context`,
    );
  }
  fs.writeFileSync(target, out);
  console.log(`  rewrote  ${file}: ${wanted}× «${clip(before, 60)}» → «${clip(after, 60)}»`);
};

// ---- the i18n bundle ----

const leafEntries = (node, prefix = []) =>
  Object.entries(node).flatMap(([key, value]) =>
    value && typeof value === 'object' ? leafEntries(value, [...prefix, key]) : [[[...prefix, key].join('.'), value]],
  );
const getPath = (node, key) =>
  key.split('.').reduce((at, part) => (at && typeof at === 'object' ? at[part] : undefined), node);
const setPath = (node, key, value) => {
  const parts = key.split('.');
  parts.slice(0, -1).reduce((at, part) => at[part], node)[parts.at(-1)] = value;
};

// The lower-case forms that are hostnames, schemes or paths rather than the brand: apply-branding.sh's own list (read
// from it, so the two never disagree) and this layer's (~/immich), longest first so a longer one is shielded whole.
const identifiers = (() => {
  const script = fs.readFileSync(path.join(here, '..', 'scripts', 'apply-branding.sh'), 'utf8');
  const match = /UPSTREAM_IDENTIFIERS_JSON='(\[[^']*\])'/.exec(script);
  if (!match) {
    stop('apply-branding.sh no longer defines UPSTREAM_IDENTIFIERS_JSON: check i18n.identifiers in brand.json by hand');
  }
  return [...JSON.parse(match[1]), ...brand.i18n.identifiers.keep].sort((a, b) => b.length - a.length);
})();

// Where a translation names a brand: Noodle's name, also run together; its short name outside it (Gallery, also with a
// case ending glued on, as German's Gallerys); upstream's name in either case, lower case only outside the identifiers.
const mentionsIn = (text) => {
  let rest = text;
  for (const id of identifiers) {
    rest = rest.replaceAll(id, '\u0001'.repeat(id.length));
  }
  const found = [];
  for (const token of [NOODLE, NOODLE_JOINED, SHORT, UPSTREAM, UPSTREAM_LOWER]) {
    rest = rest.replaceAll(token, (match, at) => {
      found.push({ token, at });
      return '\u0000'.repeat(match.length);
    });
  }
  return found.sort((a, b) => a.at - b.at);
};

// What a message's code reads, which a word swap must leave exactly as it was: its {placeholders} and ICU selectors,
// its <tags>, and its braces.
const skeleton = (text) =>
  [
    ...[...text.matchAll(/\{\s*\w+\s*[,}]|<\/?[\w-]+\s*\/?>/g)].map((match) => match[0]),
    `{${count(text, '{')}}${count(text, '}')}`,
  ].join(' ');

const classification = () => {
  const { kioku, keep, restore, phrases } = brand.i18n;
  const kiokuNoodle = new Set(kioku.noodle_gallery.keys);
  const kiokuShort = new Set(kioku.gallery.keys);
  const keepGroup = new Map([[CREDIT.key, 'credits']]);
  const seen = new Map();
  const claim = (key, where) => {
    if (seen.has(key)) {
      stop(`brand.json lists ${key} twice: under ${seen.get(key)} and ${where}`);
    }
    seen.set(key, where);
  };
  claim(CREDIT.key, 'about_credit');
  for (const key of kiokuNoodle) {
    claim(key, 'i18n.kioku.noodle_gallery');
  }
  for (const key of kiokuShort) {
    // a string may name both Noodle Gallery and bare Gallery: then it is in both Kioku lists
    if (!kiokuNoodle.has(key)) {
      claim(key, 'i18n.kioku.gallery');
    }
  }
  for (const [group, { keys }] of Object.entries(keep).filter(([group]) => !group.startsWith('_'))) {
    for (const key of keys) {
      claim(key, `i18n.keep.${group}`);
      keepGroup.set(key, group);
    }
  }
  const restoreOf = new Map();
  for (const rule of restore) {
    for (const key of rule.keys) {
      claim(key, 'i18n.restore');
      restoreOf.set(key, [...(restoreOf.get(key) ?? []), rule]);
    }
  }
  const isKioku = (key) => kiokuNoodle.has(key) || kiokuShort.has(key);
  for (const rule of phrases) {
    if (!rule.to.includes(NAME)) {
      stop(
        `brand.json phrase «${rule.from}» → «${rule.to}» (${rule.locale}) does not say ${NAME}: ` +
          'review it after a rename',
      );
    }
    for (const key of rule.keys ?? []) {
      if (!isKioku(key)) {
        stop(`brand.json phrase «${rule.from}» (${rule.locale}) lists ${key}, which is not a Kioku key`);
      }
    }
  }
  return { kiokuNoodle, kiokuShort, keepGroup, restoreOf, phrases, isKioku, listed: [...seen.keys()] };
};

// A bundle's brand names, sorted into kept (per keep group and key, with the locales) and unexpected
const audit = (bundle, keepGroup) => {
  const kept = new Map();
  const unexpected = [];
  let strings = 0;
  for (const [locale, data] of bundle) {
    for (const [key, value] of leafEntries(data)) {
      if (typeof value !== 'string') {
        continue;
      }
      const found = mentionsIn(value);
      if (found.length === 0) {
        continue;
      }
      strings++;
      const group = keepGroup.get(key);
      if (group) {
        const keys = kept.get(group) ?? new Map();
        keys.set(key, [...(keys.get(key) ?? []), locale]);
        kept.set(group, keys);
      } else {
        unexpected.push({ locale, key, value, tokens: [...new Set(found.map(({ token }) => token))] });
      }
    }
  }
  return { kept, unexpected, strings };
};

const describeUnexpected = (unexpected) => {
  const byKey = new Map();
  for (const item of unexpected) {
    byKey.set(item.key, [...(byKey.get(item.key) ?? []), item]);
  }
  return [...byKey]
    .map(([key, items]) => {
      const tokens = [...new Set(items.flatMap((item) => item.tokens))].join(', ');
      const sample = items.find((item) => item.locale === 'en') ?? items[0];
      return `    ${key} (${tokens}; ${items.length} locale${items.length === 1 ? '' : 's'}: ${items
        .map((item) => item.locale)
        .slice(0, 8)
        .join(' ')}${items.length > 8 ? ' …' : ''})\n      ${sample.locale}: ${clip(sample.value, 150)}`;
    })
    .join('\n');
};

const loadBundle = (dir) => {
  const files = fs
    .readdirSync(dir)
    .filter((file) => file.endsWith('.json'))
    .sort();
  if (!files.includes('en.json')) {
    stop(`${dir}: no en.json`);
  }
  return new Map(files.map((file) => [file.slice(0, -'.json'.length), readJson(path.join(dir, file))]));
};

const applyI18n = (dir) => {
  if (fs.existsSync(path.join(dir, 'gallery', 'en.json'))) {
    stop(
      `${dir}: the Gallery overlay is not folded in. apply-kioku.sh runs on local-build.sh's copy ` +
        'after apply-branding.sh, never on a checkout.',
    );
  }
  const bundle = loadBundle(dir);
  const original = new Map([...bundle].map(([locale, data]) => [locale, JSON.stringify(data)]));
  const en = bundle.get('en');
  const cls = classification();

  for (const key of cls.listed) {
    if (key !== CREDIT.key && typeof getPath(en, key) !== 'string') {
      stop(
        `brand.json classifies ${key}, which en.json no longer has (upstream removed or renamed it): drop or rename it`,
      );
    }
  }

  // 1. Every brand name in the bundle belongs to a classified key: a new string is a person's call, not a guess.
  const unclassified = [];
  for (const [locale, data] of bundle) {
    for (const [key, value] of leafEntries(data)) {
      if (typeof value === 'string' && !cls.listed.includes(key) && mentionsIn(value).length > 0) {
        unclassified.push({ locale, key, value, tokens: [...new Set(mentionsIn(value).map(({ token }) => token))] });
      }
    }
  }
  if (unclassified.length > 0) {
    stop(
      `${new Set(unclassified.map(({ key }) => key)).size} string(s) name a brand, ` +
        'but brand.json does not classify them. ' +
        'Add each key to i18n.kioku (the web experience, becomes Kioku) or i18n.keep (stays Noodle Gallery), ' +
        `see README.md:\n${describeUnexpected(unclassified)}`,
    );
  }

  // 2. The rewrite: the listed phrases first, then the word, then the restored path.
  const phraseState = cls.phrases.map((rule) => ({ rule, applied: 0, already: 0 }));
  for (const state of phraseState) {
    const { rule } = state;
    if (!bundle.has(rule.locale)) {
      stop(`brand.json phrase «${rule.from}»: there is no ${rule.locale}.json`);
    }
    for (const key of rule.keys ?? []) {
      if (typeof getPath(bundle.get(rule.locale), key) !== 'string') {
        stop(`brand.json phrase «${rule.from}» is for ${rule.locale} ${key}, which ${rule.locale}.json no longer has`);
      }
    }
  }
  const changed = new Map(); // key -> locales rewritten
  const restored = new Map();
  for (const [locale, data] of bundle) {
    for (const [key, value] of leafEntries(data)) {
      if (typeof value !== 'string' || !(cls.isKioku(key) || cls.restoreOf.has(key))) {
        continue;
      }
      let text = value;
      for (const state of phraseState) {
        const { rule } = state;
        if (rule.locale !== locale || !(rule.keys ? rule.keys.includes(key) : cls.isKioku(key))) {
          continue;
        }
        const found = count(text, rule.from);
        if (rule.keys && found > 1) {
          stop(`${locale} ${key}: expected «${rule.from}» once, found it ${found}×: review the phrase in brand.json`);
        }
        if (found > 0) {
          text = text.replaceAll(rule.from, rule.to);
          state.applied += found;
        } else if (text.includes(rule.to)) {
          state.already++;
        } else if (rule.keys) {
          stop(
            `${locale} ${key}: «${rule.from}» is not in «${clip(text, 140)}»: ` +
              'the translation changed, review the phrase in brand.json',
          );
        }
      }
      if (cls.kiokuNoodle.has(key)) {
        text = text.replaceAll(NOODLE, NAME);
      }
      if (cls.kiokuShort.has(key)) {
        text = text
          .split(NOODLE)
          .map((part) => part.replaceAll(SHORT, NAME))
          .join(NOODLE);
      }
      for (const rule of cls.restoreOf.get(key) ?? []) {
        if (text.includes(rule.from)) {
          text = text.replaceAll(rule.from, rule.to);
          restored.set(key, [...(restored.get(key) ?? []), locale]);
        }
      }
      if (text === value) {
        continue;
      }
      if (skeleton(text) !== skeleton(value)) {
        stop(`${locale} ${key}: the rewrite changed the message's placeholders or tags:\n  «${value}»\n  «${text}»`);
      }
      setPath(data, key, text);
      if (cls.isKioku(key)) {
        changed.set(key, [...(changed.get(key) ?? []), locale]);
      }
    }
  }

  // 3. The credit, its own key in the locales brand.json translates it into.
  const creditAdded = [];
  for (const [locale, text] of Object.entries(CREDIT.text)) {
    if (!bundle.has(locale)) {
      stop(`brand.json about_credit: there is no ${locale}.json`);
    }
    const current = bundle.get(locale)[CREDIT.key];
    if (current === undefined) {
      bundle.get(locale)[CREDIT.key] = text;
      creditAdded.push(locale);
    } else if (current !== text) {
      stop(
        `${locale}.json already has a ${CREDIT.key} of its own («${clip(current)}»): choose another about_credit.key`,
      );
    }
  }

  // 4. What is left names a brand only where the keep list says so.
  const { kept, unexpected } = audit(bundle, cls.keepGroup);
  if (unexpected.length > 0) {
    stop(
      `after the rewrite these still name a brand, and are not on the keep list:\n${describeUnexpected(unexpected)}`,
    );
  }

  // 5. No rule went quiet: each Kioku key was rewritten now or says Kioku from an earlier run, each kept key still
  //    names a brand somewhere, each phrase and path matched or is in place.
  const sayingName = (key) => [...bundle.values()].some((data) => String(getPath(data, key) ?? '').includes(NAME));
  for (const key of [...cls.kiokuNoodle, ...cls.kiokuShort]) {
    if (!changed.has(key) && !sayingName(key)) {
      stop(
        `${key} is a Kioku key, but no locale names ${cls.kiokuNoodle.has(key) ? NOODLE : SHORT} or ${NAME} ` +
          'in it any more: reclassify it in brand.json',
      );
    }
  }
  const keptKeys = new Set([...kept.values()].flatMap((keys) => [...keys.keys()]));
  for (const [key, group] of cls.keepGroup) {
    if (!keptKeys.has(key)) {
      stop(`${key} is on the keep list (${group}) but no longer names a brand anywhere: drop it from brand.json`);
    }
  }
  for (const [key, rules] of cls.restoreOf) {
    for (const rule of rules) {
      const inPlace = [...bundle.values()].some((data) => String(getPath(data, key) ?? '').includes(rule.to));
      if (!restored.has(key) && !inPlace) {
        stop(`${key}: the restore «${rule.from}» → «${rule.to}» matched nothing and the path is not there: review it`);
      }
    }
  }
  for (const { rule, applied, already } of phraseState) {
    if (applied + already === 0) {
      stop(`brand.json phrase «${rule.from}» → «${rule.to}» (${rule.locale}) matched nothing: drop it`);
    }
  }

  // 6. Every locale keeps every key it had, plus the credit.
  for (const [locale, data] of bundle) {
    const keys = new Set(leafEntries(data).map(([key]) => key));
    const had = new Set(leafEntries(JSON.parse(original.get(locale))).map(([key]) => key));
    const lost = [...had].filter((key) => !keys.has(key));
    const gained = [...keys].filter((key) => !had.has(key) && key !== CREDIT.key);
    if (lost.length > 0 || gained.length > 0) {
      stop(
        `${locale}.json: the rewrite lost ${lost.join(', ') || 'nothing'} and gained ${gained.join(', ') || 'nothing'}`,
      );
    }
  }

  let written = 0;
  for (const [locale, data] of bundle) {
    if (JSON.stringify(data) !== original.get(locale)) {
      fs.writeFileSync(path.join(dir, `${locale}.json`), `${JSON.stringify(data, null, 2)}\n`);
      written++;
    }
  }

  const strings = [...changed.values()].reduce((sum, locales) => sum + locales.length, 0);
  console.log(
    `  ${NAME}: ${changed.size} keys rewritten, ${strings} strings in ${written} of ${bundle.size} locale files`,
  );
  for (const key of [...cls.kiokuNoodle, ...cls.kiokuShort].sort()) {
    const locales = changed.get(key);
    console.log(`    ${locales ? `${String(locales.length).padStart(3)} locales` : '    already'}  ${key}`);
  }
  for (const { rule, applied, already } of phraseState) {
    const keys = rule.keys ? rule.keys.join(', ') : `every ${NAME} key`;
    console.log(
      `  phrase ${rule.locale}: «${rule.from}» → «${rule.to}»: ${applied ? `${applied}×` : 'already'} (${keys})`,
    );
  }
  for (const [key, locales] of restored) {
    console.log(`  restored ~/immich in ${key}: ${locales.join(' ')}`);
  }
  console.log(
    `  credit ${CREDIT.key}: ${creditAdded.length > 0 ? `added in ${creditAdded.join(' ')}` : 'already there'}`,
  );
  for (const [group, keys] of kept) {
    console.log(`  kept (${group}): ${keys.size} keys`);
  }
};

// ---- verify ----

const keepEntries = brand.verify.keep.map((entry) => ({
  ...entry,
  near: entry.near ? new RegExp(entry.near) : undefined,
  file: entry.file ? new RegExp(entry.file) : undefined,
}));

// Brand names in code and markup: Noodle's name, and the short name and upstream's name as words (an identifier such as
// GalleryTheme or getMyImmichLink is not one). Lower-case forms are class names, paths and hostnames there.
const codeMentionsIn = (text) => {
  const found = [];
  const word = (token) => new RegExp(`(?<![A-Za-z])${escapeRegExp(token)}(?![A-Za-z])`, 'g');
  let rest = text;
  for (const [token, pattern] of [
    [NOODLE, new RegExp(escapeRegExp(NOODLE), 'g')],
    [SHORT, word(SHORT)],
    [UPSTREAM, word(UPSTREAM)],
  ]) {
    rest = rest.replaceAll(pattern, (match, at) => {
      found.push({ token, at, length: match.length });
      return '\u0000'.repeat(match.length);
    });
  }
  return found.sort((a, b) => a.at - b.at);
};

// Comments in a source file, blanked to spaces so positions and lines stay: <!-- -->, /* */ and // (not a URL's //)
const blankComments = (text) =>
  text
    .replaceAll(/<!--[\s\S]*?-->/g, (match) => match.replaceAll(/[^\n]/g, ' '))
    .replaceAll(/\/\*[\s\S]*?\*\//g, (match) => match.replaceAll(/[^\n]/g, ' '))
    .replaceAll(/(^|[\s;{}(),])\/\/[^\n]*/gm, (match, lead) => lead + ' '.repeat(match.length - lead.length));

const lineOf = (text, at) => count(text.slice(0, at), '\n') + 1;

// A JavaScript module that only holds data: no import, an export list at its end, and what it exports a tree of
// strings under message keys. A locale's JSON becomes one: in the web a key per export, in the memory player a
// default.
const dataModule = (code) => {
  const tail = /export\s*\{([^}]*)\}\s*;?\s*$/.exec(code);
  // a bundler puts a module's imports at its very start; a translation saying "import" is no import
  if (!tail || /^\s*import[\s{*"'`]/.test(code)) {
    return undefined;
  }
  const names = tail[1]
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [local, exported = local] = entry.split(/\s+as\s+/);
      return [exported.replaceAll(/^["']|["']$/g, ''), local];
    });
  if (names.length === 0 || !names.every(([, local]) => /^[\w$]+$/.test(local))) {
    return undefined;
  }
  try {
    const object = names.map(([exported, local]) => `${JSON.stringify(exported)}:${local}`).join(',');
    const body = `${code.slice(0, tail.index)};({${object}})`;
    const exports = vm.runInNewContext(body, Object.create(null), { timeout: 2000 });
    const data = exports.default && typeof exports.default === 'object' ? exports.default : exports;
    const leaves = leafEntries(data);
    const words = leaves.filter(([key, value]) => /^[a-z][a-z0-9_.]*$/i.test(key) && typeof value === 'string');
    return leaves.length >= 10 && words.length / leaves.length > 0.95 ? data : undefined;
  } catch {
    return undefined;
  }
};

const walk = (dir) =>
  fs.existsSync(dir)
    ? fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const full = path.join(dir, entry.name);
        return entry.isDirectory() ? walk(full) : [full];
      })
    : [];

const TEXT = /\.(js|mjs|html|json|txt|css|svg|webmanifest|xml)$/;

const verify = (target) => {
  const root = path.resolve(target);
  const copyMode = fs.existsSync(path.join(root, 'i18n', 'en.json')) && fs.existsSync(path.join(root, 'web', 'src'));
  const buildMode = fs.existsSync(path.join(root, 'web', '_app'));
  if (!copyMode && !buildMode) {
    stop(`${root}: neither a build copy (i18n/, web/src/) nor local-build.sh's output (web/_app/, memory-player/)`);
  }
  const problems = [];
  const lines = [];
  const say = (line = '') => lines.push(line);
  say(`${NAME} verify, ${copyMode ? 'build copy' : 'build output'}: ${root}`);

  // 1. The i18n bundle: every brand name left is on the keep list.
  const cls = classification();
  let bundle;
  const rawSources = [];
  const localeFiles = new Set();
  if (copyMode) {
    if (fs.existsSync(path.join(root, 'i18n', 'gallery', 'en.json'))) {
      problems.push(
        'i18n/gallery/en.json is there: the overlay is not folded in, so this is a checkout, not a build copy',
      );
    }
    bundle = loadBundle(path.join(root, 'i18n'));
  } else {
    bundle = new Map();
    const modules = [...walk(path.join(root, 'web', '_app')), ...walk(path.join(root, 'memory-player'))];
    for (const file of modules.filter((file) => file.endsWith('.js'))) {
      const code = fs.readFileSync(file, 'utf8');
      if (/^var [\w$]+=`<script[\s>]/.test(code)) {
        rawSources.push(file); // a settings page's own source, which the settings search reads for its $t keys
        continue;
      }
      const data = /\bexport\s*\{/.test(code) ? dataModule(code) : undefined;
      if (data) {
        bundle.set(path.relative(root, file), data);
        localeFiles.add(file);
      }
    }
    const web = [...bundle.keys()].filter((file) => file.startsWith('web/')).length;
    if (web < 10 || web === bundle.size) {
      problems.push(
        `found ${web} locale bundles in web/_app and ${bundle.size - web} in memory-player, expected dozens and ten: ` +
          "the build's chunks changed shape, so verify-kioku.sh cannot read the bundle out of them",
      );
    }
  }
  const { kept, unexpected, strings } = audit(bundle, cls.keepGroup);
  say();
  say(`i18n: ${bundle.size} locale ${copyMode ? 'files' : 'bundles'}, ${strings} strings name a brand`);
  for (const [group, keys] of [...kept].sort()) {
    say(`  kept  ${group} (${keys.size} keys): ${brand.i18n.keep[group]?._why ?? ''}`);
    const list = [...keys].sort().map(([key, locales]) => `${key} (${locales.length})`);
    for (let i = 0; i < list.length; i += 4) {
      say(`          ${list.slice(i, i + 4).join(', ')}`);
    }
  }
  if (unexpected.length > 0) {
    say(`  UNEXPECTED, not on the keep list:\n${describeUnexpected(unexpected)}`);
    problems.push(`${new Set(unexpected.map(({ key }) => key)).size} i18n key(s) name a brand off the keep list`);
  }
  if (copyMode) {
    if (bundle.get('en')[CREDIT.key] !== CREDIT.text.en) {
      problems.push(`i18n/en.json has no ${CREDIT.key}: apply-kioku.sh has not run on this copy`);
    }
  } else if (![...bundle.values()].some((data) => data[CREDIT.key] === CREDIT.text.en)) {
    problems.push(`no locale bundle holds ${CREDIT.key}: the credit did not reach the build`);
  }

  // 2. Everything else people are shown: the surfaces of a copy (comments blanked), or the whole output.
  const files = copyMode
    ? brand.verify.surfaces.map((file) => path.join(root, file))
    : [...walk(path.join(root, 'web')), ...walk(path.join(root, 'memory-player'))].filter(
        (file) => TEXT.test(file) && !localeFiles.has(file) && !rawSources.includes(file),
      );
  const keptText = [];
  const unexpectedText = [];
  for (const file of files) {
    const relative = path.relative(root, file);
    if (!fs.existsSync(file)) {
      problems.push(`${relative}: not in the copy any more (upstream moved it): update verify.surfaces in brand.json`);
      continue;
    }
    const raw = fs.readFileSync(file, 'utf8');
    const text = copyMode ? blankComments(raw) : raw;
    for (const { token, at, length } of codeMentionsIn(text)) {
      const around = text.slice(Math.max(0, at - 160), at + length + 160);
      const entry = keepEntries.find((keep) =>
        keep.file ? keep.file.test(relative) : keep.token === token && keep.near.test(around),
      );
      const where = `${relative}:${lineOf(text, at)}`;
      const snippet = clip(text.slice(Math.max(0, at - 40), at + length + 40).trim(), 100);
      (entry ? keptText : unexpectedText).push({ where, token, snippet, why: entry?.why });
    }
  }
  say();
  say(
    `text: ${files.length} ${copyMode ? 'surface files' : 'files'} read` +
      (rawSources.length > 0
        ? ` (and ${rawSources.length} settings pages' raw source the settings search reads, never shown)`
        : ''),
  );
  const keptByWhy = new Map();
  for (const item of keptText) {
    keptByWhy.set(item.why, [...(keptByWhy.get(item.why) ?? []), item]);
  }
  for (const [reason, items] of keptByWhy) {
    say(`  kept  ${items[0].token}: ${reason}`);
    for (const item of items.slice(0, 3)) {
      say(`          ${item.where}  «${item.snippet}»`);
    }
    if (items.length > 3) {
      say(`          … ${items.length - 3} more`);
    }
  }
  if (unexpectedText.length > 0) {
    say('  UNEXPECTED, not on the keep list:');
    for (const item of unexpectedText) {
      say(`    ${item.where}  ${item.token}  «${item.snippet}»`);
    }
    problems.push(`${unexpectedText.length} brand name(s) in the text off the keep list`);
  }

  // 3. And what should say Kioku does.
  say();
  say('expected:');
  const expect = (what, ok, detail) => {
    say(`  ${ok ? 'ok  ' : 'FAIL'}  ${what}${detail ? `: ${detail}` : ''}`);
    if (!ok) {
      problems.push(`${what}${detail ? ` (${detail})` : ''}`);
    }
  };
  const read = (file) => (fs.existsSync(path.join(root, file)) ? fs.readFileSync(path.join(root, file), 'utf8') : '');
  const codes = copyMode
    ? []
    : walk(path.join(root, 'web', '_app'))
        .filter((file) => file.endsWith('.js') && !localeFiles.has(file))
        .map((file) => fs.readFileSync(file, 'utf8'));
  const scripts = codes.join('\n');
  const player = copyMode
    ? read('web/memory-player/src/SharedMemoryPlayer.svelte')
    : walk(path.join(root, 'memory-player'))
        .filter((file) => file.endsWith('.js'))
        .map((file) => fs.readFileSync(file, 'utf8'))
        .join('\n');
  const manifestFile = copyMode ? 'web/static/manifest.json' : 'web/manifest.json';
  const manifest = JSON.parse(read(manifestFile) || '{}');
  expect(
    `${manifestFile}`,
    manifest.name === NAME &&
      manifest.short_name === brand.short_name &&
      manifest.description === brand.description &&
      manifest.background_color === brand.manifest.background_color,
    `name ${manifest.name}, short_name ${manifest.short_name}, description «${manifest.description}»`,
  );
  const noscript = read(copyMode ? 'web/src/app.html' : 'web/index.html');
  expect('the no-JavaScript line', noscript.includes(`To use ${NAME},`), `«To use ${NAME}, …»`);
  const titles = copyMode
    ? [
        'web/src/routes/+layout.svelte',
        'web/src/routes/ErrorLayout.svelte',
        'web/src/lib/components/pages/SharedLinkErrorPage.svelte',
        'web/src/lib/components/pages/SharedLinkPage.svelte',
      ].reduce((sum, file) => sum + count(read(file), ` - ${NAME}`), 0)
    : count(scripts, ` - ${NAME}`);
  expect('the tab titles', titles >= 4, `«… - ${NAME}» ${titles}× (the pages, the error pages, a shared link's page)`);
  const defaultTitle = copyMode
    ? read('web/src/routes/+layout.ts').includes(`title: '${NAME}'`)
    : new RegExp(`\\btitle:\\s*[\`'"]${escapeRegExp(NAME)}[\`'"]`).test(scripts);
  expect('a page without a title of its own', defaultTitle, `«${NAME}»`);
  const inspector = copyMode ? read('web/src/lib/managers/inspector-link.svelte.ts') : scripts;
  expect('the inspector window', inspector.includes(brand.inspector_title), `«${brand.inspector_title}»`);
  const logos = copyMode
    ? count(read('web/src/lib/components/shared-components/Logo.svelte'), `alt="${brand.logo_alt}"`) +
      count(read('web/src/lib/components/layouts/AuthPageLayout.svelte'), `alt="${brand.logo_alt}"`)
    : count(scripts, `alt="${brand.logo_alt}"`);
  expect("the logos' alt text", logos >= 2, `«${brand.logo_alt}» ${logos}×`);
  const theme = copyMode ? read('web/src/lib/theme/derive.ts') : scripts;
  expect('a theme file that is not one', theme.includes(`not a ${NAME} theme`), `«not a ${NAME} theme …»`);
  const help = copyMode ? read('web/src/lib/modals/HelpAndFeedbackModal.svelte') : scripts;
  expect('Help › About: the credit', help.includes(CREDIT.key), `«${CREDIT.text.en}»`);
  const playerPage = read(copyMode ? 'web/memory-player/index.html' : 'memory-player/index.html');
  expect(
    "the memory player's page",
    playerPage.includes(`<title>${brand.memory_player.page_title}</title>`),
    `«${brand.memory_player.page_title}»`,
  );
  const phoneIcon = placeholders.PHONE_APP_ICON;
  const banner = copyMode ? read('web/src/lib/components/shared-components/open-in-app-banner.svelte') : scripts;
  const phoneIconFile = copyMode ? brand.phone_app_icon.target : `web${phoneIcon}`;
  expect(
    "the open-in-app banner: the phone app's own icon",
    banner.includes(`"${phoneIcon}"`) && fs.existsSync(path.join(root, phoneIconFile)),
    phoneIconFile,
  );
  const [titleBefore, titleAfter] = brand.memory_player.memory_title.split('{title}');
  expect(
    "a memory's title",
    (!titleBefore || player.includes(titleBefore)) && player.includes(titleAfter),
    `«${brand.memory_player.memory_title}»`,
  );
  // The loader draws its mark itself, so nothing spins it too, and the login card shows the still mark; a dark boot
  // screen shows the loader drawn for a dark ground; a 24 px favicon is listed once one ships.
  const boot = read(copyMode ? 'web/src/app.html' : 'web/index.html');
  expect('the boot screen: the loader not spun', !boot.includes('loadspin'), 'no loadspin');
  expect(
    'the boot screen: the loader for a dark ground',
    /<picture>\s*<source srcset="\/gallery-loader-dark\.svg" media="\(prefers-color-scheme: dark\)"/.test(boot),
    'a <picture> with a prefers-color-scheme: dark source',
  );
  const loaders = copyMode
    ? [read('web/src/lib/components/shared-components/LoadingSpinner.svelte')]
    : codes.filter((code) => code.includes('gallery-loader'));
  expect(
    'the loader: not spun',
    loaders.length > 0 && loaders.every((code) => !code.includes('animate-spin')),
    `no animate-spin in the ${loaders.length} ${copyMode ? 'LoadingSpinner source' : 'scripts drawing gallery-loader'}`,
  );
  const cards = copyMode
    ? [read('web/src/lib/components/layouts/AuthPageLayout.svelte')]
    : codes.filter((code) => code.includes('ws-auth-card'));
  expect(
    'the login card: the still mark',
    cards.length > 0 &&
      cards.every((code) =>
        copyMode
          ? code.includes('<Logo variant="icon" size="giant" />')
          : !/size:\s*[`'"]giant[`'"]\s*,\s*transparent\s*:/.test(code),
      ),
    'its Logo without transparent',
  );
  // the bar's mark in its two layers (Logo's ink mode): the ink files a mask in the theme's ink, the colour on top
  const layerFiles = [
    ...new Set(
      brand.assets.files
        .flatMap(({ make }) => make.map(({ target }) => target))
        .filter((target) => /\/gallery-logo-[a-z]+-(ink|colour)\.svg$/.test(target))
        .map((target) => `/${path.posix.relative('web/static', target)}`),
    ),
  ];
  const bar = copyMode ? read('web/src/lib/components/shared-components/Logo.svelte') : scripts;
  expect(
    "the bar's mark: its two layers",
    layerFiles.length === 4 && layerFiles.every((file) => bar.includes(file)),
    layerFiles.join(', '),
  );
  const has24 = fs.existsSync(path.join(root, copyMode ? 'web/static/favicon-24.png' : 'web/favicon-24.png'));
  const link24 = boot.includes('<link rel="icon" type="image/png" sizes="24x24" href="/favicon-24.png"');
  expect(
    'the 24 px favicon',
    has24 === link24,
    has24
      ? link24
        ? 'shipped, listed in app.html'
        : 'shipped, not listed'
      : link24
        ? 'listed, not shipped'
        : 'not drawn',
  );

  // The drawn assets as they ship: each target from the last source brand.json lists for it that is drawn, byte for
  // byte where it is drawn at the target's size, else at that size.
  const assetsDir = path.join(here, brand.assets.dir);
  const pngSize = (bytes) =>
    bytes.length > 24 && bytes.toString('latin1', 1, 4) === 'PNG'
      ? `${bytes.readUInt32BE(16)}x${bytes.readUInt32BE(20)}`
      : undefined;
  const drawnFor = new Map();
  for (const { source, make } of brand.assets.files) {
    if (fs.existsSync(path.join(assetsDir, source))) {
      for (const { target, size } of make) {
        drawnFor.set(target, { source, size });
      }
    }
  }
  let asDrawn = 0;
  let resized = 0;
  const wrongAssets = [];
  for (const [target, { source, size }] of drawnFor) {
    const shipped = path.join(root, copyMode ? target : target.replace(/^web\/static\//, 'web/'));
    if (!fs.existsSync(shipped)) {
      wrongAssets.push(`${path.relative(root, shipped)} is missing`);
      continue;
    }
    const drawn = fs.readFileSync(path.join(assetsDir, source));
    const out = fs.readFileSync(shipped);
    if (!size || pngSize(drawn) === `${size}x${size}`) {
      if (out.equals(drawn)) {
        asDrawn++;
      } else {
        wrongAssets.push(`${path.relative(root, shipped)} is not assets/${source} as drawn`);
      }
    } else if (pngSize(out) === `${size}x${size}`) {
      resized++;
    } else {
      wrongAssets.push(`${path.relative(root, shipped)} is ${pngSize(out)}, not ${size}x${size}`);
    }
  }
  expect(
    'the drawn assets',
    wrongAssets.length === 0,
    wrongAssets.length > 0
      ? wrongAssets.join('; ')
      : drawnFor.size > 0
        ? `${asDrawn} ship byte for byte as drawn, ${resized} resized from them`
        : 'none drawn yet',
  );

  // 4. A build output's precompressed copies say what the files say (the server sends those first).
  if (buildMode) {
    let compared = 0;
    const differ = [];
    for (const file of walk(root).filter((file) => /\.(br|gz)$/.test(file))) {
      const plain = file.replace(/\.(br|gz)$/, '');
      if (!fs.existsSync(plain)) {
        continue;
      }
      const packed = fs.readFileSync(file);
      const unpacked = file.endsWith('.br') ? zlib.brotliDecompressSync(packed) : zlib.gunzipSync(packed);
      compared++;
      if (!unpacked.equals(fs.readFileSync(plain))) {
        differ.push(path.relative(root, file));
      }
    }
    expect(
      'the precompressed copies',
      differ.length === 0,
      differ.length > 0 ? `${differ.join(', ')} differ from their files` : `${compared} match their files`,
    );
  }

  say();
  say(
    problems.length === 0
      ? `OK: nothing people see names ${NOODLE}, ${SHORT} or ${UPSTREAM} off the keep list`
      : `FAIL:\n${problems.map((problem) => `  - ${problem}`).join('\n')}`,
  );
  console.log(lines.join('\n'));
  return problems.length === 0;
};

// ---- the command line ----

const readStdin = () => fs.readFileSync(0, 'utf8');

try {
  const [command, ...args] = process.argv.slice(2);
  if (command === 'rewrite' && args.length === 3) {
    const wanted = Number(args[2]);
    if (!Number.isInteger(wanted) || wanted < 1) {
      stop(`rewrite ${args[1]}: the count is a whole number of occurrences, not ${args[2]}`);
    }
    rewrite(args[0], args[1], wanted, readStdin());
  } else if (command === 'i18n' && args.length === 1) {
    applyI18n(path.resolve(args[0]));
  } else if (command === 'verify' && args.length === 1) {
    process.exitCode = verify(args[0]) ? 0 : 1;
  } else {
    stop('usage: kioku.mjs rewrite <root> <file> <count> < rule | i18n <i18n dir> | verify <copy root | output>');
  }
} catch (error) {
  if (error instanceof Stop) {
    console.error(`kioku: ${error.message}`);
    process.exit(1);
  }
  throw error;
}
