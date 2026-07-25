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
await breakState(ops, { syncOptions: true });
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

await context.close();
const failed = results.filter(r => !r.pass).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
