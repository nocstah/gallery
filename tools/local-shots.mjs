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
// localStorage; by default a run starts from none, so two runs compare: the session cookie is kept either way),
// --curator FILE (answer Curator's requests, port 2290, from FILE instead of Curator: for a dev server on a port
// Curator's CORS does not let in, or a page in a state Curator is not in now: a JSON map from a path, "*" standing for
// one segment, to the answer, or to "@name" for a file beside FILE sent as it is, in byte ranges (a song), or to
// "@hold", never answered, so the page shows what it says while it waits; the first path that matches answers,
// anything else is a 404), --contrast (measure the text that lies on a photo, as WCAG
// does: see below).
//
// Read-only by default: every request a page makes to Gallery (/api) or Curator (:2290) passes a write guard. Reads
// (GET, HEAD, OPTIONS) and Gallery's read-only searches (POST /api/search/...) go on; anything else fails in the page
// and is listed ("write blocked: PATCH .../shared-spaces/<id>/view": opening a Space's Photos marks it viewed), with a
// count at the end of the run. --allow-writes lets them through, for a run that must. --signed-out shoots with no
// session (the sign-in pages; routes are plain paths); --family reads the signed-in account as a family member's
// (`isAdmin` false, in the headless browser only); --stub FILE answers Gallery's GET requests from a JSON map of path
// to answer. A route step end: scrolls the timeline (#asset-grid) to its end, again as its months load.
//
// --contrast: before each shot the page lists its visible text whose ground, under the middle of each line, is a
// photo (an img, a video, a canvas or a background picture) rather than an opaque colour, with its colour, size and
// weight; right after the shot a second capture is taken with every text and its shadows made transparent, the plate,
// so what lies behind each line (the photo, a scrim, glass) can be read without the letters on it. The page's
// animations are held from before the shot until after the plate, and both are taken again when anything in the page
// changed in between (a film's controls going, its next photo); a third try that still moved is marked so. Each line
// box is compared pixel by pixel with its text colour composited over it, and the run prints, lowest first, the ratio
// at the median background and at its brightest 20% and 5% (p50 / p80 / p95), against AA: 4.5:1, or 3:1 for large
// text (24px, or 18.66px at 700). The numbers go into shots.json and the plates into plates/.
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
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, extname, join, resolve } from 'node:path';
import { inflateSync } from 'node:zlib';

const CHROMIUM = process.env.GALLERY_SHOTS_CHROMIUM || '/usr/bin/chromium';
const ROOT = join(process.env.XDG_CACHE_HOME || join(homedir(), '.cache'), 'gallery-shots');
const PROFILE = join(ROOT, 'profile');

const BLOCKED = [];
const STUBS = (() => {
  const at = process.argv.indexOf('--stub');
  return at >= 0 ? JSON.parse(readFileSync(process.argv[at + 1], 'utf8')) : null;
})();
process.on('exit', () => {
  if (BLOCKED.length) console.error(`writes blocked: ${BLOCKED.length} (${[...new Set(BLOCKED)].join(', ')})`);
  else console.error('writes blocked: none');
});
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
          let contrast;
          let png;
          if (flag('contrast')) {
            // the shot and its plate are one moment: the page's animations held, and taken again (twice at most)
            // when anything in the page changed between the two (a timer that hid the controls, a new photo)
            for (let attempt = 0; attempt < 3; attempt++) {
              await page.evaluate(freezePage());
              const texts = await page.evaluate(textOnPhotos());
              png = await page.send('Page.captureScreenshot', { format: 'png' });
              let plate;
              if (texts.length > 0) {
                await page.evaluate(hideText());
                plate = Buffer.from((await page.send('Page.captureScreenshot', { format: 'png' })).data, 'base64');
                await page.evaluate(showText());
              }
              const changed = await page.evaluate(thawPage());
              if (plate && (changed === 0 || attempt === 2)) {
                mkdirSync(join(out, 'plates'), { recursive: true });
                writeFileSync(join(out, 'plates', file), plate);
                contrast = measureContrast(decodePng(plate), texts, scale).map((result) =>
                  changed === 0 ? result : { ...result, moved: true },
                );
              }
              if (changed === 0) break;
            }
          } else {
            png = await page.send('Page.captureScreenshot', { format: 'png' });
          }
          writeFileSync(join(out, file), Buffer.from(png.data, 'base64'));
          if (steps.length) {
            await page.pointerAway();
            await page.storage(stored);
          }
          shots.push({ route, label, path, steps, viewport: name, mode, file, landed, missed, contrast, ms: Date.now() - started });
          const notes = [landed === path ? '' : `landed on ${landed}`, ...missed].filter(Boolean);
          process.stdout.write(`  ${file}${notes.length ? `  (${notes.join('; ')})` : ''}\n`);
          if (contrast) printContrast(contrast);
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
  if (flag('signed-out')) {
    await page.visit(`${base}/auth/login`);
    if (!flag('keep-storage')) await page.evaluate('localStorage.clear(); sessionStorage.clear()');
    return routes.filter((route) => !route.target.startsWith('@')).map((route) => ({ ...route, path: route.target }));
  }
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
  const curator = curatorAnswers();
  const family = flag('family');
  const patterns = [
    { urlPattern: '*/api/*', requestStage: 'Request' },
    { urlPattern: '*://*:2290/*', requestStage: 'Request' },
  ];
  if (family) patterns.push({ urlPattern: '*/api/users/me', requestStage: 'Response' });
  await send('Fetch.enable', { patterns });
  const reads = new Set(['GET', 'HEAD', 'OPTIONS']);
  const readOnlyPost = (url) => url.port !== '2290' && url.pathname.startsWith('/api/search/');
  cdp.on((message) => {
    if (message.sessionId !== sessionId || message.method !== 'Fetch.requestPaused') return;
    const params = message.params;
    const { requestId, request } = params;
    const url = new URL(request.url);
    const handle = async () => {
      if (params.responseStatusCode !== undefined) {
        // --family: the signed-in account read as a family member's (not the server's admin)
        const { body, base64Encoded } = await send('Fetch.getResponseBody', { requestId });
        const user = JSON.parse(base64Encoded ? Buffer.from(body, 'base64').toString('utf8') : body);
        user.isAdmin = false;
        const text = Buffer.from(JSON.stringify(user));
        return send('Fetch.fulfillRequest', {
          requestId,
          responseCode: params.responseStatusCode,
          responseHeaders: (params.responseHeaders ?? []).filter((h) => !/^content-(length|encoding)$/i.test(h.name)),
          body: text.toString('base64'),
        });
      }
      if (!flag('allow-writes') && !reads.has(request.method) && !(request.method === 'POST' && readOnlyPost(url))) {
        BLOCKED.push(`${request.method} ${url.host}${url.pathname}`);
        console.error(`  write blocked: ${request.method} ${url.host}${url.pathname}`);
        return send('Fetch.failRequest', { requestId, errorReason: 'BlockedByClient' });
      }
      const stubbed = STUBS && request.method === 'GET' && url.port !== '2290'
        ? Object.entries(STUBS).find(([key]) => (url.pathname + url.search).startsWith(key))
        : undefined;
      if (stubbed) {
        const body = Buffer.from(JSON.stringify(stubbed[1]));
        return send('Fetch.fulfillRequest', {
          requestId,
          responseCode: 200,
          responseHeaders: [
            { name: 'content-type', value: 'application/json' },
            { name: 'content-length', value: String(body.length) },
          ],
          body: body.toString('base64'),
        });
      }
      if (curator && url.port === '2290') return answerCurator(send, params, curator);
      return send('Fetch.continueRequest', { requestId });
    };
    handle().catch((error) => {
      console.error(`guard: ${request.url}: ${error.message}`);
      return send('Fetch.failRequest', { requestId, errorReason: 'Failed' }).catch(() => {});
    });
  });
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
      } else if (kind === 'end') {
        await evaluate(`(async () => {
          const grid = document.querySelector('#asset-grid');
          if (!grid) return 'no #asset-grid';
          let still = 0;
          let last = -1;
          for (let round = 0; round < 80 && still < 4; round++) {
            grid.scrollTop = grid.scrollHeight;
            await new Promise((resolve) => setTimeout(resolve, 500));
            const at = grid.scrollTop + grid.clientHeight;
            still = Math.abs(grid.scrollHeight - at) < 2 && grid.scrollHeight === last ? still + 1 : 0;
            last = grid.scrollHeight;
          }
          return 'ok';
        })()`);
        await settle();
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

// ---- --contrast: text on photos, measured from the pixels behind it ----

/** The page's visible text that lies on a photo: each text node's line boxes (CSS px, inside the window), its colour
 * as sRGB bytes and alpha, its size and weight, and a short name for where it is. A line lies on a photo when, under
 * its middle, the first thing below the text that is a picture (img, video, canvas, a url() background) comes before
 * anything with an opaque background. Hidden, faded-out, clipped and covered text is left out. */
function textOnPhotos() {
  return `(() => {
  const unlock = document.createElement('style');
  unlock.id = 'local-shots-probe';
  unlock.textContent = '*, *::before, *::after { pointer-events: auto !important; }';
  document.head.append(unlock);
  try {
    const swatch = new OffscreenCanvas(1, 1).getContext('2d', { willReadFrequently: true });
    const rgba = (css) => {
      swatch.clearRect(0, 0, 1, 1);
      swatch.fillStyle = '#000';
      swatch.fillStyle = css;
      swatch.fillRect(0, 0, 1, 1);
      const [r, g, b, a] = swatch.getImageData(0, 0, 1, 1).data;
      return [r, g, b, a / 255];
    };
    const pictured = (node) =>
      node instanceof HTMLImageElement || node instanceof HTMLVideoElement || node instanceof HTMLCanvasElement ||
      /url\\(/.test(getComputedStyle(node).backgroundImage);
    const opaque = (node) => rgba(getComputedStyle(node).backgroundColor)[3] > 0.98;
    const onPhoto = (element, x, y) => {
      const stack = document.elementsFromPoint(x, y);
      const at = stack.indexOf(element);
      if (at === -1) return false;
      for (const node of stack.slice(at + 1)) {
        if (pictured(node)) return true;
        if (opaque(node)) return false;
      }
      return false;
    };
    const opacityOf = (element) => {
      let opacity = 1;
      for (let node = element; node; node = node.parentElement) opacity *= Number(getComputedStyle(node).opacity);
      return opacity;
    };
    const nameOf = (element) =>
      element.tagName.toLowerCase() + [...element.classList].slice(0, 2).map((name) => '.' + name).join('');
    const found = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const text = node.textContent.replace(/\\s+/g, ' ').trim();
      const element = node.parentElement;
      if (!text || !element || element.closest('script, style, noscript, template')) continue;
      const style = getComputedStyle(element);
      if (style.visibility !== 'visible') continue;
      const opacity = opacityOf(element);
      if (opacity < 0.5) continue;
      const range = document.createRange();
      range.selectNodeContents(node);
      const rects = [...range.getClientRects()]
        .map((r) => ({
          x: Math.max(0, r.left),
          y: Math.max(0, r.top),
          w: Math.min(innerWidth, r.right) - Math.max(0, r.left),
          h: Math.min(innerHeight, r.bottom) - Math.max(0, r.top),
        }))
        .filter((r) => r.w >= 2 && r.h >= 4)
        .filter((r) => onPhoto(element, r.x + r.w / 2, r.y + r.h / 2));
      if (rects.length === 0) continue;
      found.push({
        text: text.slice(0, 64),
        where: nameOf(element),
        color: rgba(style.color),
        size: Number.parseFloat(style.fontSize),
        weight: Number(style.fontWeight) || 400,
        opacity: Math.round(opacity * 100) / 100,
        rects,
      });
    }
    return found;
  } finally {
    unlock.remove();
  }
})()`;
}

/** Every text and its shadows made transparent, at once, for the plate; showText takes it away again. */
function hideText() {
  return `(() => {
  const style = document.createElement('style');
  style.id = 'local-shots-plate';
  style.textContent = '*, *::before, *::after { color: transparent !important; -webkit-text-fill-color: transparent !important; text-shadow: none !important; text-decoration-color: transparent !important; caret-color: transparent !important; } svg { visibility: hidden !important; }';
  document.head.append(style);
  return new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(() => {
    // a colour that would fade out (a button's hover transition) goes at once; nothing else moves
    for (const animation of document.getAnimations()) {
      if (/color|shadow|fill/.test(animation.transitionProperty ?? '')) animation.finish();
    }
    requestAnimationFrame(() => done(true));
  })));
})()`;
}

/** Holds the page still for a shot and its plate: its running animations (the film's drift and fades, transitions)
 * paused, and every change to the document from then on counted (thawPage returns the count and lets them run). */
function freezePage() {
  return `(() => {
  const running = document.getAnimations().filter((animation) => animation.playState === 'running');
  for (const animation of running) animation.pause();
  const changes = [];
  // the page's own changes: the styles this tool adds and takes away are not the page's
  const count = (records) => {
    for (const record of records) {
      const nodes = [...record.addedNodes, ...record.removedNodes];
      if (!nodes.some((node) => String(node.id ?? '').startsWith('local-shots-'))) changes.push(record.type);
    }
  };
  const observer = new MutationObserver(count);
  observer.observe(document, { subtree: true, childList: true, attributes: true, characterData: true });
  window.__localShotsFrozen = { running, observer, changes, count };
  return true;
})()`;
}
function thawPage() {
  return `(() => {
  const frozen = window.__localShotsFrozen;
  if (!frozen) return 0;
  frozen.count(frozen.observer.takeRecords());
  frozen.observer.disconnect();
  for (const animation of frozen.running) {
    try {
      animation.play();
    } catch {
      // gone with its element
    }
  }
  delete window.__localShotsFrozen;
  return frozen.changes.length;
})()`;
}
function showText() {
  return `document.getElementById('local-shots-plate')?.remove()`;
}

/** A PNG as Chromium writes it (8 bits, RGB or RGBA, not interlaced) into its pixels. */
function decodePng(buffer) {
  let at = 8;
  let width = 0;
  let height = 0;
  let channels = 0;
  const parts = [];
  while (at < buffer.length) {
    const length = buffer.readUInt32BE(at);
    const kind = buffer.toString('latin1', at + 4, at + 8);
    const data = buffer.subarray(at + 8, at + 8 + length);
    if (kind === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      if (data[8] !== 8 || (data[9] !== 2 && data[9] !== 6) || data[12] !== 0) throw new Error('a PNG this cannot read');
      channels = data[9] === 6 ? 4 : 3;
    } else if (kind === 'IDAT') {
      parts.push(data);
    } else if (kind === 'IEND') {
      break;
    }
    at += 12 + length;
  }
  const stride = width * channels;
  const raw = inflateSync(Buffer.concat(parts));
  const pixels = Buffer.alloc(height * stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const row = pixels.subarray(y * stride, (y + 1) * stride);
    const up = y > 0 ? pixels.subarray((y - 1) * stride, y * stride) : undefined;
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? row[x - channels] : 0;
      const b = up ? up[x] : 0;
      const c = up && x >= channels ? up[x - channels] : 0;
      let value = line[x];
      if (filter === 1) value += a;
      else if (filter === 2) value += b;
      else if (filter === 3) value += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const [pa, pb, pc] = [Math.abs(p - a), Math.abs(p - b), Math.abs(p - c)];
        value += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      row[x] = value & 255;
    }
  }
  return { width, height, channels, pixels };
}

/** WCAG's relative luminance of an sRGB colour (bytes). */
function luminance(r, g, b) {
  // the channels' linear values, worked out once (the module's top-level code runs before its constants are set)
  const linear = (luminance.table ??= Array.from({ length: 256 }, (_, value) => {
    const c = value / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }));
  return 0.2126 * linear[Math.round(r)] + 0.7152 * linear[Math.round(g)] + 0.0722 * linear[Math.round(b)];
}

/** Each text's ratio to the plate under its line boxes: its colour composited over each pixel (as the browser blends,
 * in sRGB), the WCAG ratio there, read at the background's median and at its brightest 20% and 5%. Lowest first. */
function measureContrast(plate, texts, scale) {
  const results = [];
  for (const text of texts) {
    const [tr, tg, tb, ta] = text.color;
    const ratios = [];
    for (const rect of text.rects) {
      const x0 = Math.max(0, Math.floor(rect.x * scale));
      const y0 = Math.max(0, Math.floor(rect.y * scale));
      const x1 = Math.min(plate.width, Math.ceil((rect.x + rect.w) * scale));
      const y1 = Math.min(plate.height, Math.ceil((rect.y + rect.h) * scale));
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const at = (y * plate.width + x) * plate.channels;
          const [r, g, b] = [plate.pixels[at], plate.pixels[at + 1], plate.pixels[at + 2]];
          const ground = luminance(r, g, b);
          const ink = luminance(ta * tr + (1 - ta) * r, ta * tg + (1 - ta) * g, ta * tb + (1 - ta) * b);
          ratios.push((Math.max(ground, ink) + 0.05) / (Math.min(ground, ink) + 0.05));
        }
      }
    }
    if (ratios.length === 0) continue;
    ratios.sort((a, b) => a - b);
    const at = (share) => Math.round(ratios[Math.min(ratios.length - 1, Math.floor(share * ratios.length))] * 100) / 100;
    const large = text.size >= 24 || (text.size >= 18.66 && text.weight >= 700);
    results.push({
      text: text.text,
      where: text.where,
      size: text.size,
      weight: text.weight,
      opacity: text.opacity,
      large,
      needs: large ? 3 : 4.5,
      p50: at(0.5),
      p80: at(0.2),
      p95: at(0.05),
    });
  }
  return results.sort((a, b) => a.p80 / a.needs - b.p80 / b.needs);
}

function printContrast(results) {
  for (const result of results.slice(0, 8)) {
    const flag = result.p95 >= result.needs ? 'ok  ' : result.p50 >= result.needs ? 'low ' : 'FAIL';
    const faded =
      (result.opacity < 1 ? `, at ${result.opacity} opacity` : '') + (result.moved ? ', the page moved under it' : '');
    process.stdout.write(
      `    ${flag} ${result.p50} / ${result.p80} / ${result.p95} :1 (p50/p80/p95; needs ${result.needs})  ` +
        `${result.where} ${result.size}px ${result.weight}${faded}  "${result.text}"\n`,
    );
  }
  if (results.length > 8) process.stdout.write(`    … and ${results.length - 8} more in shots.json\n`);
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

// ---- --curator: Curator's answers from a file ----

function curatorAnswers() {
  const file = option('curator', null);
  if (!file) return null;
  const path = resolve(file);
  const routes = Object.entries(JSON.parse(readFileSync(path, 'utf8'))).map(([pattern, answer]) => ({
    pattern: new RegExp(`^${pattern.split('*').map((part) => part.replaceAll(/[.?+^$()[\]{}|\\]/g, '\\$&')).join('[^/]+')}$`),
    answer,
  }));
  return { dir: dirname(path), routes };
}

/** One request to Curator, answered as Curator would, with the CORS headers the page's origin needs. */
async function answerCurator(send, { requestId, request }, { dir, routes }) {
  const types = { '.json': 'application/json', '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.wav': 'audio/wav' };
  const url = new URL(request.url);
  const origin = request.headers?.Origin ?? request.headers?.origin ?? `${url.protocol}//${url.hostname}:2284`;
  const cors = [
    { name: 'access-control-allow-origin', value: origin },
    { name: 'access-control-allow-credentials', value: 'true' },
  ];
  if (request.method === 'OPTIONS') {
    return send('Fetch.fulfillRequest', {
      requestId,
      responseCode: 204,
      responseHeaders: [...cors, { name: 'access-control-allow-headers', value: 'content-type' }],
    });
  }
  const route = routes.find(({ pattern }) => pattern.test(url.pathname));
  // "@hold": the request is left waiting, so the page shows its loading state for as long as the shot needs
  if (route?.answer === '@hold') return;
  const file = typeof route?.answer === 'string' && route.answer.startsWith('@') ? join(dir, route.answer.slice(1)) : null;
  let body = route ? (file ? readFileSync(file) : Buffer.from(JSON.stringify(route.answer))) : Buffer.from('{"detail":"not in --curator"}');
  const headers = [
    ...cors,
    { name: 'content-type', value: file ? (types[extname(file)] ?? 'application/octet-stream') : 'application/json' },
    { name: 'accept-ranges', value: 'bytes' },
  ];
  // a media element asks for byte ranges, as of Curator's songs
  const range = /bytes=(\d+)-(\d*)/.exec(request.headers?.Range ?? request.headers?.range ?? '');
  let code = route ? 200 : 404;
  if (route && file && range) {
    const size = body.length;
    const from = Number(range[1]);
    const to = range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
    body = body.subarray(from, to + 1);
    headers.push({ name: 'content-range', value: `bytes ${from}-${to}/${size}` });
    code = 206;
  }
  headers.push({ name: 'content-length', value: String(body.length) });
  return send('Fetch.fulfillRequest', { requestId, responseCode: code, responseHeaders: headers, body: body.toString('base64') });
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
