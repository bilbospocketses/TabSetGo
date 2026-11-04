// E2E coverage for the storage split-brain fix (upstream #235):
// the new tab page reads storage.local; options can save in sync mode; the
// background mirror never fires on same-value writes. These scenarios pin the
// self-heal + dual-write behavior so it can't regress.
// Scenario 1: broken state (sync.url present, local.url lost) must still redirect
// Scenario 2: a same-value Save in options must repair storage.local
// Scenario 3: regression — normal local-mode redirect still works
//
// No step fails for being slow. Each wait ends on the storage write, page
// state or event it is waiting for; its only bound is a hang guard far above
// any healthy time, and a guard that trips prints HUNG and names what it
// waited on. The one fixed window left is S4a's, an absence check (see there).
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';

const EXT_PATH = fileURLToPath(new URL('../..', import.meta.url));
const TARGET = 'https://example.com/';
const HANG_MS = 120_000;
const results = [];

// A Playwright call that runs into HANG_MS throws a TimeoutError naming the
// call and what it was waiting for.
process.on('uncaughtException', (e) => {
  if (e && e.name === 'TimeoutError') console.log(`HUNG ${e.message}`);
  else console.error(e);
  process.exit(1);
});

function record(name, pass, detail) {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -- ' + detail : ''}`);
}

// A tripped hang guard is a failure of its own: it is recorded like a failed
// assertion, so the run exits non-zero even where no assertion follows it.
function hung(what) {
  const name = `HUNG ${HANG_MS / 1000} s waiting for ${what}`;
  results.push({ name, pass: false });
  console.log(name);
}

// A navigation cut short is fine to ignore; a timeout never is.
function unlessTimeout(e) {
  if (e && e.name === 'TimeoutError') throw e;
}

const EXPIRED = Symbol('expired');

// Poll `probe` until it returns something truthy, and return that. A probe
// that throws (a page mid-reload) counts as not yet; one that never settles is
// cut off at the deadline. After HANG_MS it records HUNG (a FAIL, named after
// what it waited on) and returns undefined.
async function waitFor(what, probe) {
  const deadline = Date.now() + HANG_MS;
  for (;;) {
    let value;
    let guard;
    const expired = new Promise((r) => { guard = setTimeout(() => r(EXPIRED), Math.max(0, deadline - Date.now())); });
    try { value = await Promise.race([probe(), expired]); } catch { value = undefined; } finally { clearTimeout(guard); }
    if (value && value !== EXPIRED) return value;
    if (value === EXPIRED || Date.now() >= deadline) {
      hung(what);
      return undefined;
    }
    await new Promise((r) => setTimeout(r, 100));
  }
}

async function launch() {
  const context = await chromium.launchPersistentContext('', {
    channel: 'chromium',
    headless: true,
    acceptDownloads: true,
    args: [
      `--disable-extensions-except=${EXT_PATH}`,
      `--load-extension=${EXT_PATH}`,
    ],
  });
  context.setDefaultTimeout(HANG_MS);
  context.setDefaultNavigationTimeout(HANG_MS);
  let [sw] = context.serviceWorkers();
  if (!sw) sw = await context.waitForEvent('serviceworker', { timeout: HANG_MS });
  const extId = new URL(sw.url()).host;
  // The install handler's initial setup writes storage.local (url '' among
  // it) whenever it gets there, which could land inside a later scenario's
  // state. usingStorageApi is written by that setup and by nothing else.
  await waitFor('the install-time initial settings (local.usingStorageApi)', () =>
    sw.evaluate(() => chrome.storage.local.get('usingStorageApi').then((i) => i.usingStorageApi === true)));
  // The engine's periodic pull (an alarm it creates at worker start, first
  // firing 15 min later) would sync at a moment of its own choosing in a slow
  // run. No scenario tests it, so take it out of the run.
  await sw.evaluate(() => chrome.alarms.clear('tabsetgo-sync'));
  return { context, extId };
}

// Run storage ops from an extension page (has chrome.storage access).
async function storagePage(context, extId) {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extId}/options.html`);
  await optionsReady(page);
  return page;
}

// The options page's load chain is: ask the engine to sync, then read storage
// into the form (url field, provider radio), then the sync status, then the
// providers' availability. The OAuth rows' "Coming soon." note is replaced only
// by that last answer, so once it has gone the whole chain is done. (A checked
// provider radio is no marker: the test-only 'fake' provider has no radio.)
// With `url`, also wait until the form shows that stored url.
async function optionsReady(page, url) {
  return waitFor(`the options page to finish loading${url === undefined ? '' : ` with url ${url}`}`, () =>
    page.evaluate((url) => {
      const field = document.querySelector('input[name="url"]');
      if (!field || (url !== undefined && field.value !== url)) return false;
      return ['dropbox', 'onedrive', 'gdrive'].every((id) => {
        const radio = document.querySelector(`.provider-list input[type="radio"][value="${id}"]`);
        const note = radio && radio.closest('.provider-row').querySelector('.provider-note');
        return note && note.textContent !== 'Coming soon.';
      });
    }, url));
}

async function readStorage(page) {
  return page.evaluate(async () => ({
    local: await chrome.storage.local.get(null),
    sync: await chrome.storage.sync.get(null),
  }));
}

function worker() {
  const [sw] = context.serviceWorkers();
  return sw;
}

// Why it exists: a debounce timer left over from the previous step can straddle
// setState's clear/set and stamp syncProvider 'off' over the new state.
//
// Empties both storage areas and leaves the sync engine idle, writing `sync`
// (if given) along the way.
//
// The engine debounces a push 2 s after any change to a synced key, and that
// push first migrates storage.local, writing syncProvider when it is unset. A
// push left over from an earlier step can fire in the middle of the next
// step's writes and stamp 'off' over the state it sets. So rather than sleep
// past it, this arms the debounce itself and waits for that push to run:
//  1. clear both areas, then write `sync`;
//  2. set a placeholder always-tab-update with syncProvider 'off', then remove
//     the placeholder: a synced-key change, so the engine stamps it and
//     re-arms its single push timer;
//  3. once that is armed, remove syncProvider and wait for the push's
//     migration to write it back ('off', since syncOptions is unset), and for
//     the push's own provider lookup to be answered;
//  4. clear storage.local (it holds no synced key, so nothing re-arms).
// syncProvider stays defined until step 3, so no earlier push can write the
// value step 3 waits for. It runs in the service worker, so it can wait on the
// engine's own listener (registered first, so it runs first) and on the
// worker's storage calls, which are answered in the order they are made.
//
// Before step 1, syncOptions is set false and settled: a background mirror
// chain already in flight (get the flag, get it again, set) finishes inside
// that settle, and any mirror chain that starts after it reads the flag off.
// Otherwise a late chain could copy syncOptions true into the emptied local,
// and the migration in step 3 would then write 'browser', not 'off'. The flag
// is not a synced key and the mirror ignores local changes, so writing it arms
// nothing.
async function quiesce(sync) {
  await drainEngine({ sync, empty: true });
}

// drainEngine({ empty: false }) runs only steps 2 and 3, on the state as it
// is: for a state with syncProvider 'off' and no always-tab-update, which it
// leaves as it found them (plus the engine's syncStamps).
async function drainEngine({ sync = null, empty }) {
  const stuck = await worker().evaluate(async ({ sync, empty, hangMs }) => {
    const local = chrome.storage.local;
    // Two chained round trips: the first is answered after every storage call
    // this worker made before it; the second, after the calls those answers
    // set off (the engine's get-then-set chains are two calls deep).
    const settle = async () => { await local.get(null); await local.get(null); };
    const nextLocalChange = (what, matches) => new Promise((resolve) => {
      const guard = setTimeout(() => {
        chrome.storage.onChanged.removeListener(listener);
        resolve(what);
      }, hangMs);
      function listener(changes, ns) {
        if (ns !== 'local' || !matches(changes)) return;
        clearTimeout(guard);
        chrome.storage.onChanged.removeListener(listener);
        settle().then(() => resolve(null));
      }
      chrome.storage.onChanged.addListener(listener);
    });

    if (empty) {
      await local.set({ syncOptions: false });
      await settle();
      await local.clear();
      await chrome.storage.sync.clear();
      // syncOptions is unset, so the background mirror leaves local alone.
      if (sync) await chrome.storage.sync.set(sync);
    }
    await local.set({ 'always-tab-update': 'quiesce', syncProvider: 'off' });
    const armed = nextLocalChange('the sync engine to stamp a synced-key change',
      (c) => c['always-tab-update'] && c['always-tab-update'].oldValue === 'quiesce');
    await local.remove('always-tab-update');
    let stuck = await armed;
    if (!stuck) {
      const pushed = nextLocalChange('the debounced push to run (its migration re-writes syncProvider)',
        (c) => c.syncProvider && c.syncProvider.newValue === 'off');
      await local.remove('syncProvider');
      stuck = await pushed;
    }
    if (empty) await local.clear();
    return stuck;
  }, { sync: sync || null, empty, hangMs: HANG_MS });
  if (stuck) hung(stuck);
}

async function setState(page, { local, sync }) {
  await quiesce(sync);
  if (local) await page.evaluate(async (local) => { await chrome.storage.local.set(local); }, local);
}

// The real #235 state: sync.url present, local.url gone, and NO pending sync
// change event (writing sync fires onChanged -> the background mirror repairs
// local, which is the healthy path, not the bug). quiesce() seeds sync with the
// mirror off and waits for the engine to go idle, which also proves the
// background has handled that sync write; local.url is never written. Assert
// the precondition so the repro can't silently degrade.
async function breakState(page, extraLocal) {
  await quiesce({ url: TARGET });
  if (extraLocal) await page.evaluate(async (extraLocal) => { await chrome.storage.local.set(extraLocal); }, extraLocal);
  const pre = await readStorage(page);
  if (pre.local.url !== undefined) throw new Error('precondition failed: local.url still present');
  if (pre.sync.url !== TARGET) throw new Error('precondition failed: sync.url missing');
}

// main.html either redirects to the stored url or, when there is none,
// bootstraps Angular to render the apps page (redirect.js resumes the
// bootstrap only on that path). Wait for whichever happens; a redirect that
// never comes is caught by the apps page rendering, not by a timeout.
async function openNewTab(context, extId) {
  const page = await context.newPage();
  const outcome = new Promise((resolve) => {
    let failures = 0;
    const failed = () => { if (++failures === 2) resolve(null); };
    page.waitForURL(TARGET, { waitUntil: 'commit', timeout: HANG_MS }).then(() => resolve('redirected'), failed);
    page.waitForFunction(() => location.protocol === 'chrome-extension:' &&
      document.readyState !== 'loading' && !document.querySelector('[ng-cloak]'),
    null, { polling: 100, timeout: HANG_MS }).then(() => resolve('apps page'), failed);
  });
  // The redirect cuts this navigation short, which goto reports as an error.
  await page.goto(`chrome-extension://${extId}/main.html`).catch(unlessTimeout);
  if (!(await outcome)) hung(`main.html to redirect to ${TARGET} or render the apps page`);
  const finalUrl = page.url();
  await page.close();
  return finalUrl;
}

async function localState(page) {
  return page.evaluate(() => chrome.storage.local.get(null));
}

const { context, extId } = await launch();
console.log(`Extension loaded: ${extId}`);
const ops = await storagePage(context, extId);

// --- Scenario 1: #235 broken state -> new tab should still redirect
await breakState(ops); // local.url absent, sync.url present, no pending event
let url = await openNewTab(context, extId);
record('S1 redirect falls back to sync.url', url === TARGET, `landed on ${url}`);
await waitFor('the redirect to heal local.url', async () => (await localState(ops)).url === TARGET);
let store = await readStorage(ops);
record('S1 self-heals storage.local.url', store.local.url === TARGET,
  `local.url=${JSON.stringify(store.local.url)}`);

// --- Scenario 2: same-value Save repairs storage.local
await breakState(ops, { syncOptions: true, syncProvider: 'browser' });
await ops.reload();
await optionsReady(ops, TARGET);
const fieldVal = await ops.inputValue('input[name="url"]');
record('S2 options shows synced URL', fieldVal === TARGET, `field=${fieldVal}`);
await ops.click('button[title="Save"]'); // no edit: same-value save
await waitFor('the Save to write local.url', async () => (await localState(ops)).url === TARGET);
store = await readStorage(ops);
record('S2 same-value Save writes storage.local.url', store.local.url === TARGET,
  `local.url=${JSON.stringify(store.local.url)}`);

// --- Scenario 3: regression — plain local-mode redirect
await setState(ops, { local: { url: TARGET, syncOptions: false } });
url = await openNewTab(context, extId);
record('S3 normal local-mode redirect works', url === TARGET, `landed on ${url}`);

// --- Scenario 4: the background mirror respects the sync opt-in
// S4b runs first: it measures how long the mirror takes to copy a sync change
// into local, and S4a's absence window is sized from it.
await setState(ops, { local: { url: 'https://a.example/', syncOptions: true } });
// Writing local.url arms the engine's debounced push, which writes 'a' to
// sync. Let it land first, or it could arrive after 'b' and win.
await waitFor('the debounced browser push of url a',
  async () => (await readStorage(ops)).sync.syncDoc?.settings?.url === 'https://a.example/');
const mirrorMs = await ops.evaluate(async (hangMs) => {
  const t0 = performance.now();
  const mirrored = new Promise((resolve) => {
    const guard = setTimeout(() => {
      chrome.storage.onChanged.removeListener(listener);
      resolve(null);
    }, hangMs);
    function listener(changes, ns) {
      if (ns === 'local' && changes.url && changes.url.newValue === 'https://b.example/') {
        clearTimeout(guard);
        chrome.storage.onChanged.removeListener(listener);
        resolve(performance.now() - t0);
      }
    }
    chrome.storage.onChanged.addListener(listener);
  });
  await chrome.storage.sync.set({ url: 'https://b.example/' });
  return mirrored;
}, HANG_MS);
if (mirrorMs === null) hung('the background mirror to copy sync.url b into local');
store = await readStorage(ops);
record('S4b sync ON: incoming sync change mirrors to local',
  store.local.url === 'https://b.example/',
  `local.url=${JSON.stringify(store.local.url)} mirror=${mirrorMs === null ? 'none' : mirrorMs.toFixed(0) + ' ms'}`);

// S4a is an absence check: with sync off the mirror must do nothing, and doing
// nothing writes nothing, so no event or storage value marks "the mirror has
// decided". Wait a window instead, ten times what the mirror took to act in
// S4b and at least 1.2 s. A slower box widens the window with it; a slow
// mirror can only make this pass when it should fail, never fail correct code.
const s4aWindowMs = Math.round(Math.max(1200, 10 * (mirrorMs ?? 0)));
await setState(ops, { local: { url: 'https://a.example/', syncOptions: false } });
await ops.evaluate(async () => { await chrome.storage.sync.set({ url: 'https://b.example/' }); });
// timing: allow -- absence window, calibrated to 10x the measured S4b mirror latency (1.2 s floor); a slow box can only false-pass it, never fail correct code
await new Promise((r) => setTimeout(r, s4aWindowMs));
store = await readStorage(ops);
record('S4a sync OFF: incoming sync change does not clobber local',
  store.local.url === 'https://a.example/',
  `local.url=${JSON.stringify(store.local.url)} window=${s4aWindowMs} ms`);

// --- Scenario 5: legacy string flags normalize; sync is strictly opt-in
// (4.1: the checkbox became a provider picker; assertions target the radios)
async function selectedProvider() {
  return ops.evaluate(() => {
    const el = document.querySelector('.provider-list input[type="radio"]:checked');
    return el ? el.value : null;
  });
}
await setState(ops, { local: { url: TARGET, syncOptions: 'true' } });
await ops.reload();
await optionsReady(ops, TARGET);
store = await readStorage(ops);
record('S5a legacy "true" flag normalizes and maps to browser provider',
  store.local.syncOptions === true && (await selectedProvider()) === 'browser',
  `syncOptions=${JSON.stringify(store.local.syncOptions)} picker=${await selectedProvider()}`);

await setState(ops, { local: { url: TARGET, syncOptions: 'false' } });
await ops.reload();
await optionsReady(ops, TARGET);
store = await readStorage(ops);
record('S5b legacy "false" flag normalizes and reads as sync off',
  store.local.syncOptions === false && (await selectedProvider()) === 'off',
  `syncOptions=${JSON.stringify(store.local.syncOptions)} picker=${await selectedProvider()}`);

await setState(ops, { local: { url: TARGET } });
await ops.reload();
await optionsReady(ops, TARGET);
record('S5c missing flag defaults to sync off',
  (await selectedProvider()) === 'off', `picker=${await selectedProvider()}`);

// --- Scenario 6: theme system (system-follow, explicit override, all pages)
async function bgLuminance(page) {
  return page.evaluate(() => {
    const c = getComputedStyle(document.body).backgroundColor.match(/\d+/g).map(Number);
    return (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255;
  });
}

// theme.js paints from its localStorage copy first, then applies the value
// from chrome.storage.local when its read returns. A read made by the test
// from the same page is answered after that one, and its callback runs after
// theme.js's, so once it returns the page shows the stored theme.
async function themeSettled(page) {
  await page.evaluate(() => chrome.storage.local.get(null));
}

await setState(ops, { local: { url: TARGET, syncOptions: false } });
let themePage = await context.newPage();
await themePage.emulateMedia({ colorScheme: 'dark' });
await themePage.goto(`chrome-extension://${extId}/options.html`);
await themeSettled(themePage);
record('S6a system mode follows OS dark', (await bgLuminance(themePage)) < 0.3,
  `lum=${(await bgLuminance(themePage)).toFixed(2)}`);
await themePage.emulateMedia({ colorScheme: 'light' });
await waitFor('the page to turn light after the OS switch', async () => (await bgLuminance(themePage)) > 0.7);
record('S6a system mode follows OS light', (await bgLuminance(themePage)) > 0.7,
  `lum=${(await bgLuminance(themePage)).toFixed(2)}`);
await themePage.close();

// S6b: explicit choice beats the OS and persists across reload
await setState(ops, { local: { url: TARGET, syncOptions: false } });
themePage = await context.newPage();
await themePage.emulateMedia({ colorScheme: 'light' });
await themePage.goto(`chrome-extension://${extId}/options.html`);
await themePage.click('input[ng-model="theme"][value="dark"]');
await waitFor('the page to turn dark after choosing Dark', async () => (await bgLuminance(themePage)) < 0.3);
record('S6b explicit dark beats OS light', (await bgLuminance(themePage)) < 0.3,
  `lum=${(await bgLuminance(themePage)).toFixed(2)}`);
await themePage.reload();
await themeSettled(themePage);
record('S6b explicit dark persists across reload', (await bgLuminance(themePage)) < 0.3,
  `lum=${(await bgLuminance(themePage)).toFixed(2)}`);
await themePage.close();
await ops.evaluate(async () => { await chrome.storage.local.remove('theme'); });

// S6c: dark tokens apply on the new tab (apps) page and welcome page
await setState(ops, { local: { url: '', syncOptions: false } }); // empty url -> apps page renders
for (const path of ['main.html', 'welcome.html']) {
  themePage = await context.newPage();
  await themePage.emulateMedia({ colorScheme: 'dark' });
  await themePage.goto(`chrome-extension://${extId}/${path}`).catch(unlessTimeout);
  await themeSettled(themePage);
  record(`S6c dark tokens on ${path}`, (await bgLuminance(themePage)) < 0.3,
    `lum=${(await bgLuminance(themePage)).toFixed(2)}`);
  await themePage.close();
}

// --- Scenario 7: sync engine (migration, LWW merge, debounced push)
await setState(ops, { local: { url: TARGET, syncOptions: true } });
await ops.evaluate(async () => {
  await chrome.runtime.sendMessage({ type: 'tabsetgo-sync-now' }).catch(() => {});
});
await waitFor('the engine to migrate syncOptions to a provider',
  async () => (await localState(ops)).syncProvider === 'browser');
store = await readStorage(ops);
record('S7a legacy syncOptions migrates to browser provider',
  store.local.syncProvider === 'browser',
  `syncProvider=${JSON.stringify(store.local.syncProvider)}`);

await setState(ops, {
  local: {
    url: 'https://a.example/', theme: 'dark',
    __testFakeProvider: true, syncProvider: 'fake', syncOptions: false,
  },
});
// The seed write stamps url and theme and arms the debounced push; wait until
// that push has sent the stamped doc, so it cannot land on the remote below.
await waitFor('the debounced push of the seeded settings to the fake provider', async () => {
  const local = await localState(ops);
  const remote = local.__fakeRemote;
  const stamps = local.syncStamps || {};
  return !!local.syncLastPush && !!remote &&
    remote.stamps.url === (stamps.url || 0) && remote.stamps.theme === (stamps.theme || 0);
});
await ops.evaluate(async () => {
  await chrome.storage.local.set({
    syncStamps: { url: 1000, theme: 5000 },
    __fakeRemote: {
      version: 1, updatedAt: 2000,
      settings: { url: 'https://b.example/', theme: 'light' },
      stamps: { url: 2000, theme: 400 },
    },
  });
  await chrome.runtime.sendMessage({ type: 'tabsetgo-sync-now' }).catch(() => {});
});
// The merge writes both keys in one set, so once url shows b the theme
// decision has been made too.
await waitFor('the pull to apply the newer remote url', async () => (await localState(ops)).url === 'https://b.example/');
store = await readStorage(ops);
record('S7b LWW: newer remote key applies locally',
  store.local.url === 'https://b.example/', `url=${JSON.stringify(store.local.url)}`);
record('S7b LWW: newer local key survives remote',
  store.local.theme === 'dark', `theme=${JSON.stringify(store.local.theme)}`);
// The pull found the local theme newer and armed a push of its own, which
// would carry the url S7c writes next. Let it land first (the remote's theme
// turns dark), so S7c passes only on its own edit's push. Landing also puts
// that edit past the engine's 1 s window for ignoring its own writes, inside
// which the edit would not be stamped at all.
await waitFor("the pull's debounced push of the newer local theme",
  async () => (await localState(ops)).__fakeRemote?.settings?.theme === 'dark');

await ops.evaluate(async () => {
  await chrome.storage.local.set({ url: 'https://c.example/' });
});
await waitFor('the debounced push of url c',
  async () => (await localState(ops)).__fakeRemote?.settings?.url === 'https://c.example/');
store = await readStorage(ops);
record('S7c local change pushes to provider (debounced)',
  !!store.local.__fakeRemote && store.local.__fakeRemote.settings.url === 'https://c.example/',
  `remote.url=${JSON.stringify(store.local.__fakeRemote && store.local.__fakeRemote.settings.url)}`);

// --- Scenario 7d/7e: import wins everywhere; export produces the doc
await ops.reload();
await optionsReady(ops, 'https://c.example/');
await ops.setInputFiles('#import-file', {
  name: 'tabsetgo-settings.json',
  mimeType: 'application/json',
  buffer: Buffer.from(JSON.stringify({
    version: 1, updatedAt: 1,
    settings: { url: 'https://d.example/', theme: 'light' },
    stamps: { url: 1, theme: 1 },
  })),
});
await waitFor('the import to write url d and theme light', async () => {
  const local = await localState(ops);
  return local.url === 'https://d.example/' && local.theme === 'light';
});
store = await readStorage(ops);
record('S7d import wins despite older stamps in the file',
  store.local.url === 'https://d.example/' && store.local.theme === 'light',
  `url=${JSON.stringify(store.local.url)} theme=${JSON.stringify(store.local.theme)}`);
// The import arms the debounced push; let it land before Scenario 8.
await waitFor('the debounced push of the imported settings',
  async () => (await localState(ops)).__fakeRemote?.settings?.url === 'https://d.example/');

const downloadPromise = ops.waitForEvent('download', { timeout: HANG_MS })
  .catch(() => { hung('the settings download'); return null; });
await ops.click('button[title="Download settings"]').catch(() => {});
const download = await downloadPromise;
let exported = null;
if (download) {
  const stream = await download.createReadStream();
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  try { exported = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { /* bad json */ }
}
record('S7e export downloads the sync document',
  !!exported && exported.version === 1 && exported.settings.url === 'https://d.example/',
  `exported=${exported ? 'doc v' + exported.version : 'none'}`);

// --- Scenario 8: WebDAV provider, real roundtrip against a local server
const { createServer } = await import('node:http');
const davStore = new Map();
const davRequests = []; // methods, in the order the server handled them
const dav = createServer((req, res) => {
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    if (req.method === 'PUT') {
      davStore.set(req.url, Buffer.concat(chunks));
      res.statusCode = 201;
      res.end();
    } else if (req.method === 'GET') {
      const body = davStore.get(req.url);
      if (!body) { res.statusCode = 404; res.end(); }
      else { res.statusCode = 200; res.end(body); }
    } else { res.statusCode = 405; res.end(); }
    davRequests.push(req.method);
  });
});
await new Promise((r) => dav.listen(0, '127.0.0.1', r));
const davBase = `http://127.0.0.1:${dav.address().port}/sync`;

function davUrl() {
  try { return JSON.parse(davStore.get('/sync/tabsetgo-settings.json').toString('utf8')).settings.url; }
  catch { return null; }
}

// Write the settings with the provider off, and drain the debounced push that
// the url write arms (with no provider it sends nothing). Turning WebDAV on
// writes no synced key, so the only request that can then PUT the file is the
// first sync's seed: its pull finds no file (404) and pushes local in its
// place, and the message is answered after that PUT.
await setState(ops, {
  local: {
    url: 'https://e.example/',
    syncProvider: 'off',
    webdavConfig: { baseUrl: davBase, username: 'u', appPassword: 'p' },
  },
});
await drainEngine({ empty: false });
await ops.evaluate(async () => {
  await chrome.runtime.sendMessage({ type: 'tabsetgo-sync-set-provider', id: 'webdav' }).catch(() => {});
});
const seededUrl = davUrl();
record('S8a WebDAV seeds the remote file on first sync',
  seededUrl === 'https://e.example/' && davRequests.join() === 'GET,PUT',
  `remote.url=${JSON.stringify(seededUrl)} requests=${davRequests.join() || 'none'}`);

// No push is armed now (the url write's push was drained above, and the seed
// is pushed directly), so nothing can overwrite the newer file below.
davStore.set('/sync/tabsetgo-settings.json', Buffer.from(JSON.stringify({
  version: 1, updatedAt: 9999999999999,
  settings: { url: 'https://f.example/' },
  stamps: { url: 9999999999999 },
})));
await ops.evaluate(async () => {
  await chrome.runtime.sendMessage({ type: 'tabsetgo-sync-now' }).catch(() => {});
});
await waitFor('the WebDAV pull to apply url f', async () => (await localState(ops)).url === 'https://f.example/');
store = await readStorage(ops);
record('S8b WebDAV pull applies newer remote settings',
  store.local.url === 'https://f.example/', `url=${JSON.stringify(store.local.url)}`);
dav.close();

// --- Scenario 9: OAuth providers gate cleanly + PKCE vector
await setState(ops, { local: { url: TARGET } });
await ops.reload();
// optionsReady also waits for the providers' availability answer, so the
// disabled state below is the engine's verdict, not the page's initial one.
await optionsReady(ops, TARGET);
const pickerDisabled = await ops.evaluate(() => {
  const out = {};
  for (const id of ['dropbox', 'onedrive', 'gdrive']) {
    const el = document.querySelector(`.provider-list input[type="radio"][value="${id}"]`);
    out[id] = el ? el.disabled : null;
  }
  return out;
});
record('S9a unconfigured OAuth providers are disabled in the picker',
  pickerDisabled.dropbox === true && pickerDisabled.onedrive === true && pickerDisabled.gdrive === true,
  JSON.stringify(pickerDisabled));

const pkce = await worker().evaluate(async () => {
  return self.TabSetGoSync.oauth.challengeFor('test');
});
record('S9b PKCE S256 challenge matches known vector',
  pkce === 'n4bQgYhMfWWaL-qgxVrQFaO_TxsrC4Is0V1sFbDwCgg', `challenge=${pkce}`);

await context.close();
const failed = results.filter(r => !r.pass).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
