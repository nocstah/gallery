#!/usr/bin/env node
// Local Omarchy layer: the engine behind apply-kioku.sh (README.md beside it says what it does
// and why). Node only, no dependencies, like i18n/gallery/merge.mjs; the words and the i18n classification it works by
// are brand.json's, and the names it replaces are the ones Noodle's apply-branding.sh wrote (branding/config.json).
//
//   node kioku.mjs rewrite <root> <file> <count>   a literal rewrite of <root>/<file>, its rule on stdin: the old text,
//                                                  a line "=>", the new text (@NAME@ and the like from brand.json)
//   node kioku.mjs i18n <i18n dir>                 name the folded bundle Kioku by brand.json's classification
//
// Every rewrite checks that it found what it was written against, as often as it was, and stops otherwise, naming the
// file and the text: after a rebase, a rule that quietly matched nothing would ship the old name.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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
    stop(
      'apply-branding.sh no longer defines UPSTREAM_IDENTIFIERS_JSON: check i18n.identifiers in brand.json by hand',
    );
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
  } else {
    stop('usage: kioku.mjs rewrite <root> <file> <count> < rule | i18n <i18n dir>');
  }
} catch (error) {
  if (error instanceof Stop) {
    console.error(`kioku: ${error.message}`);
    process.exit(1);
  }
  throw error;
}
