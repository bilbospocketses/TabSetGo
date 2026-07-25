// Capture 1280x800 store-listing screenshots in both themes.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const EXT_PATH = fileURLToPath(new URL('..', import.meta.url));
const OUT = fileURLToPath(new URL('../docs/store-assets/', import.meta.url));
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

const shots = [
  { file: 'options-light.png', theme: 'light', path: 'options.html' },
  { file: 'options-dark.png', theme: 'dark', path: 'options.html' },
  { file: 'welcome.png', theme: 'light', path: 'welcome.html' },
];

for (const shot of shots) {
  await page.evaluate(async (t) => { await chrome.storage.local.set({ theme: t }); }, shot.theme);
  await page.goto(`chrome-extension://${extId}/${shot.path}`);
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}/${shot.file}` });
  console.log(`captured ${shot.file}`);
}

// leave the profile-neutral default behind
await page.evaluate(async () => { await chrome.storage.local.remove('theme'); });
await context.close();
