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
// --routes /photos,/albums,@album,@photo (@album: the album changed last; @photo: the newest photo, in the viewer),
// --viewports aorus,dell,laptop,tablet,phone, --modes dark,light, --all (every viewport and mode),
// --hidpi (the monitors' real pixel density), --out DIR.
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
  const routes = list(option('routes', ROUTES.join(',')));
  for (const name of viewports) {
    if (!VIEWPORTS[name]) fail(`unknown viewport ${name} (${Object.keys(VIEWPORTS).join(', ')})`);
  }
  if (!existsSync(join(PROFILE, 'Default'))) fail('no screenshot session yet: run ./local-dev.sh login once');
  if (profileInUse()) fail('the screenshot profile is open in a window: close the login window first');
  const stamp = new Date().toISOString().slice(0, 19).replaceAll(':', '').replace('T', '-');
  const out = option('out', join(ROOT, stamp));
  mkdirSync(out, { recursive: true });

  const browser = await launch();
  const shots = [];
  try {
    const page = await browser.page();
    const resolved = await resolveRoutes(page, base, routes);
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
        for (const { route, path } of resolved) {
          const file = `${slug(route)}.${name}.${mode}.png`;
          const started = Date.now();
          const landed = await page.visit(base + path);
          const png = await page.send('Page.captureScreenshot', { format: 'png' });
          writeFileSync(join(out, file), Buffer.from(png.data, 'base64'));
          shots.push({ route, path, viewport: name, mode, file, landed, ms: Date.now() - started });
          process.stdout.write(`  ${file}${landed === path ? '' : `  (landed on ${landed})`}\n`);
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

/** @album and @photo become real paths, asked of Gallery with the session's own cookie. */
async function resolveRoutes(page, base, routes) {
  const landed = await page.visit(`${base}/photos`);
  if (landed.startsWith('/auth/')) throw new Error('not logged in: run ./local-dev.sh login once');
  const ids = await page.evaluate(`(async () => {
    const albums = await fetch('/api/albums').then((r) => r.json()).catch(() => []);
    const album = albums.filter((a) => a.assetCount > 8).sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))[0];
    const found = await fetch('/api/search/metadata', { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ size: 1, type: 'IMAGE', visibility: 'timeline' }) }).then((r) => r.json()).catch(() => ({}));
    return { album: album?.id ?? null, photo: found?.assets?.items?.[0]?.id ?? null };
  })()`);
  return routes.flatMap((route) => {
    if (route === '@album') return ids.album ? [{ route, path: `/albums/${ids.album}` }] : [];
    if (route === '@photo') return ids.photo ? [{ route, path: `/photos/${ids.photo}` }] : [];
    return [{ route, path: route }];
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
  return {
    send,
    evaluate,
    /** Opens the URL and waits until the page has settled: loaded, the network quiet for 800 ms, images decoded. */
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
    },
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
    if (!byRoute.has(shot.route)) byRoute.set(shot.route, []);
    byRoute.get(shot.route).push(shot);
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
  return route.replace(/^@/, '').replace(/^\//, '').replace(/[^a-z0-9]+/gi, '-').replace(/-$/, '') || 'root';
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function fail(message) {
  console.error(`local-shots: ${message}`);
  process.exit(1);
}
