// Capture 1280x800 store-listing screenshots from the rebranded extension.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const EXT_PATH = 'C:/Users/jscha/source/repos/TabSetGo';
const OUT = 'C:/Users/jscha/source/repos/TabSetGo/docs/store-assets';
mkdirSync(OUT, { recursive: true });

const context = await chromium.launchPersistentContext('', {
  channel: 'chromium',
  headless: true,
  viewport: { width: 1280, height: 800 },
  args: [
    `--disable-extensions-except=${EXT_PATH}`,
    `--load-extension=${EXT_PATH}`,
  ],
});
let [sw] = context.serviceWorkers();
if (!sw) sw = await context.waitForEvent('serviceworker', { timeout: 10000 });
const extId = new URL(sw.url()).host;

const page = await context.newPage();
await page.goto(`chrome-extension://${extId}/options.html`);
await page.evaluate(async () => {
  await chrome.storage.local.set({ url: 'https://news.ycombinator.com/', syncOptions: false });
});
await page.reload();
await page.waitForFunction(() =>
  document.querySelector('input[name="url"]')?.value.length > 0, { timeout: 5000 }).catch(() => {});
await page.screenshot({ path: `${OUT}/options.png` });
console.log('captured options.png');

await page.goto(`chrome-extension://${extId}/welcome.html`);
await page.waitForTimeout(800);
await page.screenshot({ path: `${OUT}/welcome.png` });
console.log('captured welcome.png');

await context.close();
