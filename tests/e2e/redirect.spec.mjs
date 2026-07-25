// E2E coverage for the storage split-brain fix (upstream #235):
// the new tab page reads storage.local; options can save in sync mode; the
// background mirror never fires on same-value writes. These scenarios pin the
// self-heal + dual-write behavior so it can't regress.
// Scenario 1: broken state (sync.url present, local.url lost) must still redirect
// Scenario 2: a same-value Save in options must repair storage.local
// Scenario 3: regression — normal local-mode redirect still works
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';

const EXT_PATH = fileURLToPath(new URL('../..', import.meta.url));
const TARGET = 'https://example.com/';
const results = [];

function record(name, pass, detail) {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -- ' + detail : ''}`);
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
  let [sw] = context.serviceWorkers();
  if (!sw) sw = await context.waitForEvent('serviceworker', { timeout: 10000 });
  const extId = new URL(sw.url()).host;
  return { context, extId };
}

// Run storage ops from an extension page (has chrome.storage access).
async function storagePage(context, extId) {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extId}/options.html`);
  return page;
}

async function readStorage(page) {
  return page.evaluate(async () => ({
    local: await chrome.storage.local.get(null),
    sync: await chrome.storage.sync.get(null),
  }));
}

async function setState(page, { local, sync }) {
  await page.evaluate(async ({ local, sync }) => {
    await chrome.storage.local.clear();
    await chrome.storage.sync.clear();
    if (local) await chrome.storage.local.set(local);
    if (sync) await chrome.storage.sync.set(sync);
  }, { local, sync });
}

// The real #235 state: sync.url present, local.url gone, and NO pending sync
// change event (writing sync fires onChanged -> the background mirror repairs
// local, which is the healthy path, not the bug). So: seed sync, let the
// mirror settle, then knock out local.url via a local-namespace change the
// mirror ignores. Assert the precondition so the repro can't silently degrade.
async function breakState(page, extraLocal) {
  await page.evaluate(async ({ t, extraLocal }) => {
    await chrome.storage.local.clear();
    await chrome.storage.sync.clear();
    await chrome.storage.sync.set({ url: t });
    await new Promise(r => setTimeout(r, 800)); // let background mirror settle
    await chrome.storage.local.remove('url');
    if (extraLocal) await chrome.storage.local.set(extraLocal);
  }, { t: TARGET, extraLocal });
  const pre = await readStorage(page);
  if (pre.local.url !== undefined) throw new Error('precondition failed: local.url still present');
  if (pre.sync.url !== TARGET) throw new Error('precondition failed: sync.url missing');
}

async function openNewTab(context, extId) {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extId}/main.html`).catch(() => {});
  try {
    await page.waitForURL(TARGET, { timeout: 4000 });
  } catch { /* stayed on main.html (apps page) */ }
  const finalUrl = page.url();
  await page.close();
  return finalUrl;
}

const { context, extId } = await launch();
console.log(`Extension loaded: ${extId}`);
const ops = await storagePage(context, extId);

// --- Scenario 1: #235 broken state -> new tab should still redirect
await breakState(ops); // local.url absent, sync.url present, no pending event
let url = await openNewTab(context, extId);
record('S1 redirect falls back to sync.url', url === TARGET, `landed on ${url}`);
let store = await readStorage(ops);
record('S1 self-heals storage.local.url', store.local.url === TARGET,
  `local.url=${JSON.stringify(store.local.url)}`);

// --- Scenario 2: same-value Save repairs storage.local
await breakState(ops, { syncOptions: true, syncProvider: 'browser' });
await ops.reload();
await ops.waitForFunction(
  t => document.querySelector('input[name="url"]')?.value === t, TARGET, { timeout: 5000 }
).catch(() => {});
const fieldVal = await ops.inputValue('input[name="url"]');
record('S2 options shows synced URL', fieldVal === TARGET, `field=${fieldVal}`);
await ops.click('button[title="Save"]'); // no edit: same-value save
await ops.waitForTimeout(1000);
store = await readStorage(ops);
record('S2 same-value Save writes storage.local.url', store.local.url === TARGET,
  `local.url=${JSON.stringify(store.local.url)}`);

// --- Scenario 3: regression — plain local-mode redirect
await setState(ops, { local: { url: TARGET, syncOptions: false } });
url = await openNewTab(context, extId);
record('S3 normal local-mode redirect works', url === TARGET, `landed on ${url}`);

// --- Scenario 4: the background mirror respects the sync opt-in
await setState(ops, { local: { url: 'https://a.example/', syncOptions: false } });
await ops.evaluate(async () => { await chrome.storage.sync.set({ url: 'https://b.example/' }); });
await ops.waitForTimeout(1200);
store = await readStorage(ops);
record('S4a sync OFF: incoming sync change does not clobber local',
  store.local.url === 'https://a.example/', `local.url=${JSON.stringify(store.local.url)}`);

await setState(ops, { local: { url: 'https://a.example/', syncOptions: true } });
await ops.evaluate(async () => { await chrome.storage.sync.set({ url: 'https://b.example/' }); });
await ops.waitForTimeout(1200);
store = await readStorage(ops);
record('S4b sync ON: incoming sync change mirrors to local',
  store.local.url === 'https://b.example/', `local.url=${JSON.stringify(store.local.url)}`);

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
await ops.waitForTimeout(800);
store = await readStorage(ops);
record('S5a legacy "true" flag normalizes and maps to browser provider',
  store.local.syncOptions === true && (await selectedProvider()) === 'browser',
  `syncOptions=${JSON.stringify(store.local.syncOptions)} picker=${await selectedProvider()}`);

await setState(ops, { local: { url: TARGET, syncOptions: 'false' } });
await ops.reload();
await ops.waitForTimeout(800);
store = await readStorage(ops);
record('S5b legacy "false" flag normalizes and reads as sync off',
  store.local.syncOptions === false && (await selectedProvider()) === 'off',
  `syncOptions=${JSON.stringify(store.local.syncOptions)} picker=${await selectedProvider()}`);

await setState(ops, { local: { url: TARGET } });
await ops.reload();
await ops.waitForTimeout(800);
record('S5c missing flag defaults to sync off',
  (await selectedProvider()) === 'off', `picker=${await selectedProvider()}`);

// --- Scenario 6: theme system (system-follow, explicit override, all pages)
async function bgLuminance(page) {
  return page.evaluate(() => {
    const c = getComputedStyle(document.body).backgroundColor.match(/\d+/g).map(Number);
    return (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255;
  });
}

await setState(ops, { local: { url: TARGET, syncOptions: false } });
let themePage = await context.newPage();
await themePage.emulateMedia({ colorScheme: 'dark' });
await themePage.goto(`chrome-extension://${extId}/options.html`);
await themePage.waitForTimeout(400);
record('S6a system mode follows OS dark', (await bgLuminance(themePage)) < 0.3,
  `lum=${(await bgLuminance(themePage)).toFixed(2)}`);
await themePage.emulateMedia({ colorScheme: 'light' });
await themePage.waitForTimeout(200);
record('S6a system mode follows OS light', (await bgLuminance(themePage)) > 0.7,
  `lum=${(await bgLuminance(themePage)).toFixed(2)}`);
await themePage.close();

// S6b: explicit choice beats the OS and persists across reload
await setState(ops, { local: { url: TARGET, syncOptions: false } });
themePage = await context.newPage();
await themePage.emulateMedia({ colorScheme: 'light' });
await themePage.goto(`chrome-extension://${extId}/options.html`);
await themePage.click('input[ng-model="theme"][value="dark"]').catch(() => {});
await themePage.waitForTimeout(400);
record('S6b explicit dark beats OS light', (await bgLuminance(themePage)) < 0.3,
  `lum=${(await bgLuminance(themePage)).toFixed(2)}`);
await themePage.reload();
await themePage.waitForTimeout(400);
record('S6b explicit dark persists across reload', (await bgLuminance(themePage)) < 0.3,
  `lum=${(await bgLuminance(themePage)).toFixed(2)}`);
await themePage.close();
await ops.evaluate(async () => { await chrome.storage.local.remove('theme'); });

// S6c: dark tokens apply on the new tab (apps) page and welcome page
await setState(ops, { local: { url: '', syncOptions: false } }); // empty url -> apps page renders
for (const path of ['main.html', 'welcome.html']) {
  themePage = await context.newPage();
  await themePage.emulateMedia({ colorScheme: 'dark' });
  await themePage.goto(`chrome-extension://${extId}/${path}`).catch(() => {});
  await themePage.waitForTimeout(400);
  record(`S6c dark tokens on ${path}`, (await bgLuminance(themePage)) < 0.3,
    `lum=${(await bgLuminance(themePage)).toFixed(2)}`);
  await themePage.close();
}

// --- Scenario 7: sync engine (migration, LWW merge, debounced push)
await setState(ops, { local: { url: TARGET, syncOptions: true } });
await ops.evaluate(async () => {
  await chrome.runtime.sendMessage({ type: 'tabsetgo-sync-now' }).catch(() => {});
});
await ops.waitForTimeout(600);
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
await ops.waitForTimeout(2600); // let seed-write stamp bumps + debounce push settle
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
await ops.waitForTimeout(800);
store = await readStorage(ops);
record('S7b LWW: newer remote key applies locally',
  store.local.url === 'https://b.example/', `url=${JSON.stringify(store.local.url)}`);
record('S7b LWW: newer local key survives remote',
  store.local.theme === 'dark', `theme=${JSON.stringify(store.local.theme)}`);

await ops.evaluate(async () => {
  await chrome.storage.local.set({ url: 'https://c.example/' });
});
await ops.waitForTimeout(3800); // stamp bump + 2s debounce + slack
store = await readStorage(ops);
record('S7c local change pushes to provider (debounced)',
  !!store.local.__fakeRemote && store.local.__fakeRemote.settings.url === 'https://c.example/',
  `remote.url=${JSON.stringify(store.local.__fakeRemote && store.local.__fakeRemote.settings.url)}`);

// --- Scenario 7d/7e: import wins everywhere; export produces the doc
await ops.reload();
await ops.waitForTimeout(600);
await ops.setInputFiles('#import-file', {
  name: 'tabsetgo-settings.json',
  mimeType: 'application/json',
  buffer: Buffer.from(JSON.stringify({
    version: 1, updatedAt: 1,
    settings: { url: 'https://d.example/', theme: 'light' },
    stamps: { url: 1, theme: 1 },
  })),
});
await ops.waitForTimeout(800);
store = await readStorage(ops);
record('S7d import wins despite older stamps in the file',
  store.local.url === 'https://d.example/' && store.local.theme === 'light',
  `url=${JSON.stringify(store.local.url)} theme=${JSON.stringify(store.local.theme)}`);

const downloadPromise = ops.waitForEvent('download', { timeout: 5000 }).catch(() => null);
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
  });
});
await new Promise((r) => dav.listen(0, '127.0.0.1', r));
const davBase = `http://127.0.0.1:${dav.address().port}/sync`;

await setState(ops, {
  local: {
    url: 'https://e.example/',
    syncProvider: 'webdav',
    webdavConfig: { baseUrl: davBase, username: 'u', appPassword: 'p' },
  },
});
await ops.waitForTimeout(400);
await ops.evaluate(async () => {
  await chrome.runtime.sendMessage({ type: 'tabsetgo-sync-now' }).catch(() => {});
});
await ops.waitForTimeout(600);
const seeded = davStore.get('/sync/tabsetgo-settings.json');
let seededUrl = null;
try { seededUrl = JSON.parse(seeded.toString('utf8')).settings.url; } catch { /* none */ }
record('S8a WebDAV seeds the remote file on first sync',
  seededUrl === 'https://e.example/', `remote.url=${JSON.stringify(seededUrl)}`);

davStore.set('/sync/tabsetgo-settings.json', Buffer.from(JSON.stringify({
  version: 1, updatedAt: 9999999999999,
  settings: { url: 'https://f.example/' },
  stamps: { url: 9999999999999 },
})));
await ops.evaluate(async () => {
  await chrome.runtime.sendMessage({ type: 'tabsetgo-sync-now' }).catch(() => {});
});
await ops.waitForTimeout(600);
store = await readStorage(ops);
record('S8b WebDAV pull applies newer remote settings',
  store.local.url === 'https://f.example/', `url=${JSON.stringify(store.local.url)}`);
dav.close();

await context.close();
const failed = results.filter(r => !r.pass).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
