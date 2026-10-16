#!/usr/bin/env node
// Local Omarchy layer: screenshots of Gallery for design work, taken by a headless Chromium (the system's
// /usr/bin/chromium, driven over the DevTools protocol, no dependencies), so an agent can look at what it changed
// without a visible browser. Run through ../local-dev.sh:
//
//   ./local-dev.sh login                        once: a Chromium window with the screenshot profile opens on Gallery's
//                                               login page; log in yourself, then close the window
//   ./local-dev.sh shots [options]              the pages, viewports and colour modes below, into
//                                               ~/.cache/gallery-shots/<time>/ with an index.html contact sheet
//   ./local-dev.sh shots --compare A B          what changed between two runs (ImageMagick), with diff images
//
// Options: --live (the deployed Gallery on :2283 instead of the dev server on :2284), --base URL,
// --routes /photos,/albums,@album,@photo (@album: the album changed last; @photo: the newest photo, in the viewer;
// @person: the named person with the most photos), --states (the interactive states below instead of the pages),
// --viewports aorus,dell,laptop,tablet,phone, --modes dark,light, --all (every viewport and mode),
// --hidpi (the monitors' real pixel density), --out DIR, --eval JS (no shots: run the expression on each route, after
// its steps, at the first viewport and mode, and print what it returns, to read the real DOM), --keep-storage (keep what the pages left in the profile's
// localStorage; by default a run starts from none, so two runs compare: the session cookie is kept either way).
//
// A route can go on into a state before the shot, with steps after ">": key:Control+k, hover:SELECTOR,
// click:SELECTOR, rclick:SELECTOR (right click), scroll:PX (the wheel over the middle of the page), wait:MS,
// press:SELECTOR (the button held down there for --hold MS, 450 by default: a photo lifts), drag:SELECTOR (the held
// pointer glides there), release: (let go: a drop); and it can be named with "name=" in front, e.g. --routes
// 'menu=/photos>rclick:[data-asset]'. A shot taken with the button still held is cancelled with Escape before the
// button is let go, so a carried photo is put back, never dropped. Steps are real input events, so the
// page reacts as to a person (hover shows a tile's checkbox, a right click opens Gallery's own menu). A selector cannot
// hold "," or ">". What a stepped shot leaves in localStorage or sessionStorage (an opened filter rail, a grouping) is
// put back after it, so it cannot carry into the shots that follow.
//
// The profile (~/.cache/gallery-shots/profile) holds only the Gallery session you log in with; nothing here reads or
// stores a password. Its colour mode is the page's prefers-color-scheme, which is what "Follow Omarchy" follows.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, lstatSync, mkdirSync, readdirSync, readlinkSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, join } from 'node:path';

const CHROMIUM = process.env.GALLERY_SHOTS_CHROMIUM || '/usr/bin/chromium';
const ROOT = join(process.env.XDG_CACHE_HOME || join(homedir(), '.cache'), 'gallery-shots');
const PROFILE = join(ROOT, 'profile');

const VIEWPORTS = {
  aorus: { width: 2560, height: 1440, scale: 1, hidpi: 1.5, mobile: false, label: 'AORUS 32″, 2560×1440' },
  dell: { width: 1296, height: 2304, scale: 1, hidpi: 1.666667, mobile: false, label: 'Dell portrait, 1296×2304' },
  laptop: { width: 1440, height: 900, scale: 1, hidpi: 2, mobile: false, label: 'Laptop, 1440×900' },
  tablet: { width: 820, height: 1180, scale: 2, hidpi: 2, mobile: true, label: 'Tablet, 820×1180' },
  phone: { width: 390, height: 844, scale: 2, hidpi: 3, mobile: true, label: 'Phone, 390×844' },
};
const ROUTES = [
  '/photos',
  '@photo',
  '/albums',
  '@album',
  '/explore',
  '/people',
  '/places',
  '/map',
  '/memories',
  '/favorites',
  '/inbox',
  '/search',
  '/sharing',
  '/utilities',
  '/user-settings',
];
const TILE = '[data-thumbnail-focus-container][data-asset]';
/** What a person clicks into: the states a page-only run never shows. */
const STATES = [
  `photos-hover=/photos>hover:${TILE}`,
  `photos-selected=/photos>hover:${TILE}>click:${TILE} [role=checkbox]`,
  `photos-menu=/photos>rclick:${TILE}`,
  `photos-filters=/photos>click:[data-testid=filter-toggle-btn]`,
  'photos-scrolled=/photos>scroll:6000',
  'photos-years=/photos>click:button.ws-year',
  'photos-palette=/photos>key:Control+k',
  'photos-shortcuts=/photos>key:Shift+?',
  'photo-info=@photo>key:i',
  'person=@person',
  `search=/search?query=${encodeURIComponent(JSON.stringify({ query: 'beach' }))}`,
];

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const option = (name, fallback) => {
  const at = args.indexOf(`--${name}`);
  return at >= 0 && args[at + 1] && !args[at + 1].startsWith('--') ? args[at + 1] : fallback;
};
const list = (value) => value.split(',').map((item) => item.trim()).filter(Boolean);

if (args[0] === 'login') {
  login();
} else if (flag('compare')) {
  const at = args.indexOf('--compare');
  compare(args[at + 1], args[at + 2]);
} else {
  await shoot();
}

// ---- login: a visible window with the screenshot profile, closed by the user ----

function login() {
  mkdirSync(PROFILE, { recursive: true });
  const url = `${option('base', 'http://localhost:2283')}/auth/login`;
  const child = spawn(
    CHROMIUM,
    [`--user-data-dir=${PROFILE}`, '--password-store=basic', '--no-first-run', '--no-default-browser-check', '--new-window', url],
    { detached: true, stdio: 'ignore' },
  );
  child.unref();
  console.log('A Chromium window opened on Gallery’s login page. Log in there, then close the window.');
  console.log('The session stays in ' + PROFILE + '; screenshots use it from then on.');
}

// ---- screenshots ----

async function shoot() {
  const base = (flag('live') ? 'http://localhost:2283' : option('base', 'http://localhost:2284')).replace(/\/$/, '');
  const viewports = flag('all') ? Object.keys(VIEWPORTS) : list(option('viewports', 'aorus,phone'));
  const modes = flag('all') ? ['dark', 'light'] : list(option('modes', 'dark'));
  const routes = (flag('states') ? STATES : list(option('routes', ROUTES.join(',')))).map(parseRoute);
  for (const name of viewports) {
    if (!VIEWPORTS[name]) fail(`unknown viewport ${name} (${Object.keys(VIEWPORTS).join(', ')})`);
  }
  if (!existsSync(join(PROFILE, 'Default'))) fail('no screenshot session yet: run ./local-dev.sh login once');
  // the profile serves one browser at a time: a run started while another holds it (a second checkout, a second
  // agent) waits its turn, up to ten minutes
  for (let waited = 0; profileInUse(); waited += 2) {
    if (waited === 0) console.log('waiting for the screenshot profile (another run or the login window has it)');
    if (waited >= 600) fail('the screenshot profile stayed in use for ten minutes: close the login window first');
    await sleep(2000);
  }
  const stamp = new Date().toISOString().slice(0, 19).replaceAll(':', '').replace('T', '-');
  const out = option('out', join(ROOT, stamp));
  if (!flag('eval')) mkdirSync(out, { recursive: true });

  // another run can take the profile between the check above and the launch: Chromium then refuses it (its
  // SingletonLock), and the run waits and tries again within the same ten minutes
  let browser;
  for (let waited = 0; !browser; waited += 2) {
    try {
      browser = await launch();
    } catch (error) {
      if (!/SingletonLock|ProcessSingleton/.test(error.message) || waited >= 600) fail(error.message);
      await sleep(2000);
    }
  }
  const shots = [];
  try {
    const page = await browser.page();
    const resolved = await resolveRoutes(page, base, routes);
    const probe = option('eval', null);
    if (probe) {
      const vp = VIEWPORTS[viewports[0]];
      await page.send('Emulation.setDeviceMetricsOverride', {
        width: vp.width,
        height: vp.height,
        deviceScaleFactor: vp.scale,
        mobile: vp.mobile,
      });
      await page.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: modes[0] }] });
      for (const { label, path, steps } of resolved) {
        await page.visit(base + path);
        for (const step of steps) await page.act(step);
        if (steps.length) await page.settle();
        console.log(`${label}: ${JSON.stringify(await page.evaluate(probe), null, 1)}`);
      }
      browser.close();
      return;
    }
    for (const name of viewports) {
      const vp = VIEWPORTS[name];
      const scale = flag('hidpi') ? vp.hidpi : vp.scale;
      await page.send('Emulation.setDeviceMetricsOverride', {
        width: vp.width,
        height: vp.height,
        deviceScaleFactor: scale,
        mobile: vp.mobile,
      });
      await page.send('Emulation.setTouchEmulationEnabled', { enabled: vp.mobile });
      for (const mode of modes) {
        await page.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: mode }] });
        for (const { route, label, path, steps } of resolved) {
          const file = `${slug(label)}.${name}.${mode}.png`;
          const started = Date.now();
          let landed = await page.visit(base + path);
          const stored = steps.length ? await page.storage() : null;
          const missed = [];
          for (const step of steps) {
            const problem = await page.act(step);
            if (problem) missed.push(problem);
          }
          if (steps.length) landed = await page.settle();
          const png = await page.send('Page.captureScreenshot', { format: 'png' });
          writeFileSync(join(out, file), Buffer.from(png.data, 'base64'));
          if (steps.length) {
            await page.pointerAway();
            await page.storage(stored);
          }
          shots.push({ route, label, path, steps, viewport: name, mode, file, landed, missed, ms: Date.now() - started });
          const notes = [landed === path ? '' : `landed on ${landed}`, ...missed].filter(Boolean);
          process.stdout.write(`  ${file}${notes.length ? `  (${notes.join('; ')})` : ''}\n`);
        }
      }
    }
  } catch (error) {
    browser.close();
    fail(error.message);
  }
  browser.close();
  writeFileSync(join(out, 'shots.json'), JSON.stringify({ base, shots }, null, 1) + '\n');
  writeFileSync(join(out, 'index.html'), sheet(base, shots));
  const latest = join(ROOT, 'latest');
  rmSync(latest, { force: true });
  symlinkSync(out, latest);
  console.log(`${shots.length} screenshots in ${out}  (contact sheet: ${join(out, 'index.html')}; also ${latest})`);
}

/** "name=TARGET>step>step": the target is a path or an @alias; the name (else the whole spec) names the file. */
function parseRoute(spec) {
  const named = spec.match(/^([a-z0-9-]+)=(.*)$/i);
  const [target, ...steps] = (named ? named[2] : spec).split('>');
  return { route: spec, label: named ? named[1] : spec, target, steps };
}

/** @album, @photo and @person become real paths, asked of Gallery with the session's own cookie. */
async function resolveRoutes(page, base, routes) {
  const landed = await page.visit(`${base}/photos`);
  if (landed.startsWith('/auth/')) throw new Error('not logged in: run ./local-dev.sh login once');
  if (!flag('keep-storage')) await page.evaluate('localStorage.clear(); sessionStorage.clear()');
  const ids = await page.evaluate(`(async () => {
    const albums = await fetch('/api/albums').then((r) => r.json()).catch(() => []);
    const album = albums.filter((a) => a.assetCount > 8).sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))[0];
    const found = await fetch('/api/search/metadata', { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ size: 1, type: 'IMAGE', visibility: 'timeline' }) }).then((r) => r.json()).catch(() => ({}));
    const people = await fetch('/api/people?size=100').then((r) => r.json()).catch(() => ({}));
    const person = (people.people ?? []).find((p) => p.name && !p.isHidden);
    return { album: album?.id ?? null, photo: found?.assets?.items?.[0]?.id ?? null, person: person?.id ?? null };
  })()`);
  const aliases = {
    '@album': ids.album && `/albums/${ids.album}`,
    '@photo': ids.photo && `/photos/${ids.photo}`,
    '@person': ids.person && `/people/${ids.person}`,
  };
  return routes.flatMap((route) => {
    const path = route.target.startsWith('@') ? aliases[route.target] : route.target;
    return path ? [{ ...route, path }] : [];
  });
}

async function launch() {
  const chrome = spawn(
    CHROMIUM,
    [
      '--headless=new',
      `--user-data-dir=${PROFILE}`,
      '--password-store=basic',
      '--no-first-run',
      '--no-default-browser-check',
      '--remote-debugging-port=0',
      '--hide-scrollbars',
      '--mute-audio',
      'about:blank',
    ],
    { stdio: ['ignore', 'ignore', 'pipe'] },
  );
  const wsUrl = await new Promise((resolve, reject) => {
    let text = '';
    const timer = setTimeout(() => reject(new Error('Chromium did not start')), 20000);
    chrome.stderr.on('data', (chunk) => {
      text += chunk;
      const match = text.match(/DevTools listening on (ws:\/\/\S+)/);
      if (match) {
        clearTimeout(timer);
        resolve(match[1]);
      }
    });
    chrome.on('exit', () => reject(new Error(`Chromium exited: ${text.trim().split('\n').slice(-3).join(' ')}`)));
  });
  const cdp = await connect(wsUrl);
  return {
    async page() {
      const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
      const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
      return pageSession(cdp, sessionId);
    },
    close() {
      cdp.close();
      chrome.kill();
    },
  };
}

function connect(url) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    let next = 1;
    const waiting = new Map();
    const listeners = new Set();
    socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      if (message.id && waiting.has(message.id)) {
        const { resolve: done, reject: failed } = waiting.get(message.id);
        waiting.delete(message.id);
        if (message.error) failed(new Error(message.error.message));
        else done(message.result);
      } else if (message.method) {
        for (const listener of listeners) listener(message);
      }
    });
    socket.addEventListener('open', () =>
      resolve({
        send(method, params = {}, sessionId) {
          const id = next++;
          socket.send(JSON.stringify({ id, method, params, sessionId }));
          return new Promise((done, failed) => waiting.set(id, { resolve: done, reject: failed }));
        },
        on(listener) {
          listeners.add(listener);
          return () => listeners.delete(listener);
        },
        close() {
          socket.close();
        },
      }),
    );
    socket.addEventListener('error', () => reject(new Error(`cannot reach Chromium at ${url}`)));
  });
}

async function pageSession(cdp, sessionId) {
  const send = (method, params) => cdp.send(method, params, sessionId);
  await send('Page.enable');
  await send('Network.enable');
  await send('Runtime.enable');
  const inflight = new Set();
  let lastActivity = Date.now();
  cdp.on((message) => {
    if (message.sessionId !== sessionId) return;
    const id = message.params?.requestId;
    if (message.method === 'Network.requestWillBeSent') inflight.add(id);
    if (message.method === 'Network.loadingFinished' || message.method === 'Network.loadingFailed') inflight.delete(id);
    if (message.method.startsWith('Network.')) lastActivity = Date.now();
  });
  const evaluate = async (expression) => {
    const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
    return result.result.value;
  };
  /** Waits until the network has been quiet for 800 ms and the images are decoded; returns where the page is. */
  const settle = async () => {
    const deadline = Date.now() + 15000;
    while (Date.now() < deadline && (inflight.size > 0 || Date.now() - lastActivity < 800)) {
      await sleep(100);
    }
    await evaluate(`Promise.race([
      Promise.all([...document.images].filter((i) => !i.complete).map((i) => new Promise((r) => { i.onload = i.onerror = r; }))),
      new Promise((r) => setTimeout(r, 5000)),
    ])`);
    await sleep(400);
    return evaluate('location.pathname + location.search');
  };
  const mouse = (type, x, y, extra = {}) => send('Input.dispatchMouseEvent', { type, x, y, ...extra });
  // where the pointer is, and whether its button is held (press:, drag:, release:)
  let pointerAt = { x: 0, y: 0 };
  let held = false;
  /** The middle of the first element matching the selector, where it is now (a drag must not scroll the page). */
  const middle = (selector) =>
    evaluate(`(() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    })()`);
  /** The middle of the first element matching the selector, brought into view if it is outside it. */
  const centre = (selector) =>
    evaluate(`(() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) return null;
      el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    })()`);
  return {
    send,
    evaluate,
    settle,
    /** Opens the URL and waits until the page has settled: loaded, the network quiet, images decoded. */
    async visit(url) {
      inflight.clear();
      const loaded = new Promise((resolve) => {
        const off = cdp.on((message) => {
          if (message.sessionId === sessionId && message.method === 'Page.loadEventFired') {
            off();
            resolve();
          }
        });
        setTimeout(resolve, 15000);
      });
      await send('Page.navigate', { url });
      await loaded;
      return settle();
    },
    /** One step as real input (key:, hover:, click:, rclick:, scroll:, wait:); returns what went wrong, if anything. */
    async act(step) {
      const at = step.indexOf(':');
      const kind = step.slice(0, at);
      const arg = step.slice(at + 1);
      if (kind === 'wait') {
        await sleep(Number(arg) || 0);
      } else if (kind === 'key') {
        const parts = arg.split('+');
        const key = parts.pop();
        const bits = { Alt: 1, Control: 2, Meta: 4, Shift: 8 };
        const modifiers = parts.reduce((sum, part) => sum | (bits[part] ?? 0), 0);
        const printable = key.length === 1 && !(modifiers & 6);
        const code = key.length === 1 ? key.toUpperCase().charCodeAt(0) : 0;
        await send('Input.dispatchKeyEvent', {
          type: printable ? 'keyDown' : 'rawKeyDown',
          key,
          modifiers,
          windowsVirtualKeyCode: key === '?' ? 191 : code,
          ...(printable ? { text: key } : {}),
        });
        await send('Input.dispatchKeyEvent', { type: 'keyUp', key, modifiers });
      } else if (kind === 'scroll') {
        const { w, h } = await evaluate('({ w: innerWidth, h: innerHeight })');
        await mouse('mouseWheel', w / 2, h / 2, { deltaX: 0, deltaY: Number(arg) || 0 });
        await sleep(1200);
      } else if (kind === 'press') {
        // a held press: long enough for a press-and-hold to lift the photo under it
        const point = await centre(arg);
        if (!point) return `press: nothing matches ${arg}`;
        await mouse('mouseMoved', point.x, point.y);
        await mouse('mousePressed', point.x, point.y, { button: 'left', buttons: 1, clickCount: 1 });
        pointerAt = point;
        held = true;
        await sleep(Number(option('hold', 450)));
      } else if (kind === 'drag') {
        // the held pointer glides to the element in small steps, as a hand moves it
        const point = await middle(arg);
        if (!point) return `drag: nothing matches ${arg}`;
        const steps = 12;
        for (let step = 1; step <= steps; step++) {
          const x = pointerAt.x + ((point.x - pointerAt.x) * step) / steps;
          const y = pointerAt.y + ((point.y - pointerAt.y) * step) / steps;
          await mouse('mouseMoved', x, y, { button: held ? 'left' : 'none', buttons: held ? 1 : 0 });
          await sleep(16);
        }
        pointerAt = point;
      } else if (kind === 'release') {
        await mouse('mouseReleased', pointerAt.x, pointerAt.y, { button: 'left', buttons: 0, clickCount: 1 });
        held = false;
      } else if (kind === 'hover' || kind === 'click' || kind === 'rclick') {
        const point = await centre(arg);
        if (!point) return `${kind}: nothing matches ${arg}`;
        await mouse('mouseMoved', point.x, point.y);
        if (kind !== 'hover') {
          const button = kind === 'rclick' ? 'right' : 'left';
          await mouse('mousePressed', point.x, point.y, { button, clickCount: 1 });
          await mouse('mouseReleased', point.x, point.y, { button, clickCount: 1 });
        }
      } else {
        return `unknown step ${step}`;
      }
      await sleep(350);
      return null;
    },
    /** Takes the pointer off the page, so a hover does not carry into the next shot; a button still held is let go
     * after Escape, so what it carries is put back, never dropped. */
    async pointerAway() {
      if (held) {
        await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Escape', windowsVirtualKeyCode: 27 });
        await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', windowsVirtualKeyCode: 27 });
        await mouse('mouseReleased', -10, -10, { button: 'left', buttons: 0, clickCount: 1 });
        held = false;
      }
      await mouse('mouseMoved', -10, -10);
    },
    /** Without an argument, the page's localStorage and sessionStorage; with one, puts them back as they were. */
    storage: (saved) =>
      saved
        ? evaluate(`(() => {
            const saved = ${JSON.stringify(saved)};
            for (const [store, items] of [[localStorage, saved.local], [sessionStorage, saved.session]]) {
              store.clear();
              for (const [key, value] of Object.entries(items)) store.setItem(key, value);
            }
          })()`)
        : evaluate('({ local: { ...localStorage }, session: { ...sessionStorage } })'),
  };
}

// ---- comparing two runs ----

function compare(a, b) {
  if (!a || !b) fail('usage: --compare RUN_A RUN_B (folders under ~/.cache/gallery-shots)');
  const dirA = existsSync(a) ? a : join(ROOT, a);
  const dirB = existsSync(b) ? b : join(ROOT, b);
  const out = join(dirB, `diff-from-${basename(dirA)}`);
  mkdirSync(out, { recursive: true });
  const rows = [];
  for (const file of readdirSync(dirB).filter((name) => name.endsWith('.png'))) {
    if (!existsSync(join(dirA, file))) {
      rows.push({ file, changed: 'new' });
      continue;
    }
    const result = spawnSync('magick', ['compare', '-metric', 'AE', '-fuzz', '3%', join(dirA, file), join(dirB, file), join(out, file)], {
      encoding: 'utf8',
    });
    const pixels = Number.parseFloat((result.stderr || '').trim().split(/\s+/)[0]);
    rows.push({ file, changed: Number.isFinite(pixels) ? pixels : 'size differs' });
  }
  const weight = (row) => (typeof row.changed === 'number' ? row.changed : Number.POSITIVE_INFINITY);
  rows.sort((x, y) => weight(y) - weight(x));
  for (const row of rows) {
    const what = typeof row.changed === 'number' ? (row.changed === 0 ? 'same' : `${row.changed} px changed`) : row.changed;
    console.log(`  ${row.file}: ${what}`);
  }
  console.log(`diff images in ${out}`);
}

// ---- helpers ----

function sheet(base, shots) {
  const byRoute = new Map();
  for (const shot of shots) {
    if (!byRoute.has(shot.label)) byRoute.set(shot.label, []);
    byRoute.get(shot.label).push(shot);
  }
  const sections = [...byRoute]
    .map(
      ([route, list]) => `<section><h2>${route}</h2><div class="row">${list
        .map(
          (shot) =>
            `<figure><a href="${shot.file}"><img src="${shot.file}" loading="lazy"></a><figcaption>${VIEWPORTS[shot.viewport].label} · ${shot.mode}</figcaption></figure>`,
        )
        .join('')}</div></section>`,
    )
    .join('\n');
  return `<!doctype html><meta charset="utf-8"><title>Gallery screenshots</title>
<style>body{margin:16px;font:13px/1.4 system-ui;background:#111;color:#ddd}h2{font-size:14px;margin:24px 0 8px}
.row{display:flex;gap:12px;align-items:flex-start;flex-wrap:wrap}figure{margin:0}img{max-height:360px;border:1px solid #333}
figcaption{color:#999;margin-top:4px}</style>
<h1 style="font-size:16px">${base} · ${new Date().toLocaleString()}</h1>
${sections}`;
}

/** Chromium's lock names the host and pid holding the profile; a lock left by a killed run is not in use. */
function profileInUse() {
  const lock = join(PROFILE, 'SingletonLock');
  try {
    lstatSync(lock);
  } catch {
    return false;
  }
  const pid = Number.parseInt(readlinkSync(lock).split('-').pop(), 10);
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function slug(route) {
  const name = route.replace(/^@/, '').replace(/^\//, '').replace(/[^a-z0-9]+/gi, '-').replace(/-$/, '');
  return name.slice(0, 80) || 'root';
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function fail(message) {
  console.error(`local-shots: ${message}`);
  process.exit(1);
}
