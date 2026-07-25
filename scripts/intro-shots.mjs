// Regenerates the welcome-page intro slide previews (images/screenshots/)
// from the live, refreshed options UI. Run after UI changes so the intro
// never drifts from reality again.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const EXT_PATH = fileURLToPath(new URL('..', import.meta.url));
const OUT = new URL('../images/screenshots/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
mkdirSync(OUT, { recursive: true });

const context = await chromium.launchPersistentContext('', {
  channel: 'chromium',
  headless: true,
  viewport: { width: 800, height: 900 },
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
  await chrome.storage.local.clear();
  await chrome.storage.sync.clear();
  await chrome.storage.local.set({ url: 'https://example.com/', syncOptions: false, theme: 'light' });
});
await page.reload();
await page.waitForFunction(() =>
  document.querySelector('input[name="url"]')?.value.length > 0, { timeout: 5000 });

async function cardClip(selector, pad = 8) {
  const box = await page.locator(selector).boundingBox();
  return {
    x: Math.max(0, box.x - pad),
    y: Math.max(0, box.y - pad),
    width: Math.min(800, box.width + pad * 2),
    height: box.height + pad * 2,
  };
}

const urlCard = '.setting-card:has(input[name="url"])';
const syncCard = '.setting-card:has(input[ng-model="sync"])';
const chipsCard = '.setting-card:has(.chip-grid)';

// default: the settings column (URL + address bar cards)
const top = await cardClip(urlCard);
await page.screenshot({ path: `${OUT}/tabsetgo-options.png`, clip: { ...top, height: 360 } });

// ss-url: URL field focused with a value
await page.click('input[name="url"]');
await page.screenshot({ path: `${OUT}/tabsetgo-options.url.png`, clip: await cardClip(urlCard) });

// ss-save: same card, Save prominent (primary button)
await page.screenshot({ path: `${OUT}/tabsetgo-options.save.png`, clip: await cardClip(urlCard) });

// ss-sync: sync card with the box checked
await page.click('input[ng-model="sync"]');
await page.waitForTimeout(300);
await page.screenshot({ path: `${OUT}/tabsetgo-options.sync.png`, clip: await cardClip(syncCard) });
await page.click('input[ng-model="sync"]'); // restore off

// ss-saved: click Save, capture the toast region
await page.click('button[title="Save"]');
await page.waitForTimeout(350);
await page.screenshot({ path: `${OUT}/tabsetgo-options.saved.png`, clip: { x: 380, y: 20, width: 400, height: 220 } });

// ss-quick: the one-click chips card
await page.screenshot({ path: `${OUT}/tabsetgo-options.quick.png`, clip: await cardClip(chipsCard) });

console.log('intro screenshots regenerated');
await context.close();
