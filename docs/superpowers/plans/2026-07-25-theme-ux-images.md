# TabSetGo Theme + Options Refresh + Images Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the pre-publish polish: OS-following theme with System/Light/Dark toggle on all pages, a modernized descriptive options UI, brand-consistent theme-aware images, and the privacy/store-asset wrap — all inside the unreleased 4.0.0.

**Architecture:** CSS custom-property tokens (`css/theme.css`) consumed by the three existing sheets; a framework-free `js/theme.js` stamping `html[data-theme]` pre-paint from a localStorage mirror with `chrome.storage.local` as source of truth; Angular options controller gains `theme` state + `changeTheme()`; assets converted to masked SVGs colored by tokens.

**Tech Stack:** Plain CSS/JS (MV3 extension pages, no inline scripts), AngularJS 1.x options app, Playwright e2e (channel chromium headless), ImageMagick + PowerShell for generated assets.

## Global Constraints

- Squash-merge PRs via `gh pr merge --squash`; branch only via `pwsh C:/Users/jscha/.claude/scripts/git-new-branch.ps1`.
- Absolute paths in all commands; repo root `C:/Users/jscha/source/repos/TabSetGo`.
- ASCII-only in PowerShell scripts (pre-edit hook enforces).
- Selector stability: `input[name="url"]`, `button[title="Save"]`, `button[title="Cancel"]`, `button[title="One-time get Synced URL"]`, `input[ng-model="sync"]`, `input[ng-model="alwaysTabUpdate"]` unchanged.
- Storage key `theme`: `"system" | "light" | "dark"`, default `"system"`; local always, sync only when sync enabled.
- All work folds into the unreleased **4.0.0** (no version bump).
- Suite must be green (13/13 after Task 2) before every merge: `npm --prefix C:/Users/jscha/source/repos/TabSetGo run test:e2e`.

---

### Task 1: Theme engine (tokens + pre-paint stamping + page wiring) — PR "feat/theme-system"

**Files:**
- Create: `css/theme.css`, `js/theme.js`
- Modify: `main.html`, `options.html`, `welcome.html` (head: theme.css first stylesheet, theme.js first script), `css/common.css`, `css/options.css`, `css/welcome.css` (colors → tokens)
- Test: `tests/e2e/redirect.spec.mjs` (S6a, S6c; S6b lands in Task 2)

**Interfaces:**
- Produces: tokens `--bg --surface --header-bg --text --text-muted --heading --border --accent --accent-contrast --link --link-hover --input-bg --input-border --card-shadow --chip-bg --chip-hover --code-bg --selected-bg`; `js/theme.js` applying `localStorage.theme` / `chrome.storage.local.theme`.

- [ ] **Step 1: Write failing tests S6a + S6c** (append before `context.close()`):

```js
async function bgLuminance(page) {
  return page.evaluate(() => {
    const c = getComputedStyle(document.body).backgroundColor.match(/\d+/g).map(Number);
    return (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255;
  });
}
// S6a: System mode follows the OS
await setState(ops, { local: { url: TARGET, syncOptions: false } });
let p = await context.newPage();
await p.emulateMedia({ colorScheme: 'dark' });
await p.goto(`chrome-extension://${extId}/options.html`);
record('S6a system mode follows OS dark', (await bgLuminance(p)) < 0.3, `lum=${await bgLuminance(p)}`);
await p.emulateMedia({ colorScheme: 'light' });
record('S6a system mode follows OS light', (await bgLuminance(p)) > 0.7, `lum=${await bgLuminance(p)}`);
await p.close();
// S6c: dark applies on all three pages (System + OS dark)
for (const path of ['main.html', 'welcome.html']) {
  p = await context.newPage();
  await p.emulateMedia({ colorScheme: 'dark' });
  await p.goto(`chrome-extension://${extId}/${path}`).catch(() => {});
  record(`S6c dark tokens on ${path}`, (await bgLuminance(p)) < 0.3, `lum=${await bgLuminance(p)}`);
  await p.close();
}
```
Note: for S6c main.html, storage must hold an empty url so the Apps page renders instead of redirecting — set `{ local: { url: '', syncOptions: false } }` first.

- [ ] **Step 2: Run suite; S6a/S6c FAIL (bg stays light), S1-S5 PASS.**
- [ ] **Step 3: Create `css/theme.css`** with `:root` light tokens, `:root[data-theme="dark"]` dark block, and the same dark block in `@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { … } }`. Light: bg `#f9f9f9`, surface `#ffffff`, header-bg `#e8e8e8`, text `#333`, muted `#666`, heading `#222`, border `#d9d9d9`, accent `#2F6BFF`, accent-contrast `#fff`, link `#1a56db`, link-hover `#0f3fa8`, input-bg `#fff`, input-border `#bbb`, card-shadow `rgba(0,0,0,0.08)`, chip-bg `#eef2f8`, chip-hover `#dde6f5`, code-bg `#f0f0f0`, selected-bg `#cfe0ff`. Dark: bg `#16181d`, surface `#1e2128`, header-bg `#23262e`, text `#d7dae0`, muted `#9aa1ab`, heading `#eceff3`, border `#343945`, accent `#4d84ff`, accent-contrast `#0d1117`, link `#7aa5ff`, link-hover `#a3c0ff`, input-bg `#12141a`, input-border `#3c4250`, card-shadow `rgba(0,0,0,0.5)`, chip-bg `#262b35`, chip-hover `#2f3542`, code-bg `#262b35`, selected-bg `#21396b`. Also set `body { background: var(--bg); color: var(--text); }` and `color-scheme: light dark` on `:root`.
- [ ] **Step 4: Create `js/theme.js`:**

```js
/*global chrome,document,window,localStorage */
(function () {
    'use strict';
    function apply(theme) {
        if (theme === 'light' || theme === 'dark') {
            document.documentElement.setAttribute('data-theme', theme);
        } else {
            document.documentElement.removeAttribute('data-theme');
        }
    }
    var cached = null;
    try { cached = localStorage.getItem('theme'); } catch (e) {}
    apply(cached);
    if (typeof chrome !== 'undefined' && chrome.storage) {
        chrome.storage.local.get({ 'theme': 'system' }, function (items) {
            var t = items.theme || 'system';
            try { localStorage.setItem('theme', t); } catch (e) {}
            apply(t);
        });
        chrome.storage.onChanged.addListener(function (changes, ns) {
            if (ns === 'local' && changes.theme) {
                var t = changes.theme.newValue || 'system';
                try { localStorage.setItem('theme', t); } catch (e) {}
                apply(t);
            }
        });
    }
})();
```
- [ ] **Step 5: Wire pages:** in each of `main.html`, `options.html`, `welcome.html` add `<script type="text/javascript" src="js/theme.js"></script>` as the FIRST head script and `<link rel="stylesheet" href="css/theme.css" type="text/css">` before the other stylesheets.
- [ ] **Step 6: Refactor `common.css`, `options.css`, `welcome.css`:** replace every hardcoded color on themed surfaces with the matching token (backgrounds, text, borders, links, header, code, selected states). Grep check afterwards: `#[0-9a-fA-F]{3,6}` hits remaining only inside `theme.css` or clearly-static art (e.g., font-awesome sheets are exempt).
- [ ] **Step 7: Run suite → S6a/S6c PASS, S1-S5 still PASS.**
- [ ] **Step 8: Commit** (with spec + plan docs) on branch `feat/theme-system`.

### Task 2: Appearance control + persistence (same PR)

**Files:**
- Modify: `options.html` (Appearance card), `js/options_controller.js` (theme state + `changeTheme`)
- Test: S6b in `tests/e2e/redirect.spec.mjs`

**Interfaces:**
- Consumes: `Storage.saveLocal/saveSync/getLocal` ($q promises), tokens from Task 1.
- Produces: radios `input[ng-model="theme"][value="system|light|dark"]`, `$scope.changeTheme(theme)`.

- [ ] **Step 1: Failing S6b:**

```js
// S6b: explicit choice beats OS and persists
await setState(ops, { local: { url: TARGET, syncOptions: false } });
p = await context.newPage();
await p.emulateMedia({ colorScheme: 'light' });
await p.goto(`chrome-extension://${extId}/options.html`);
await p.click('input[ng-model="theme"][value="dark"]');
await p.waitForTimeout(400);
record('S6b explicit dark beats OS light', (await bgLuminance(p)) < 0.3, `lum=${await bgLuminance(p)}`);
await p.reload();
await p.waitForTimeout(400);
record('S6b explicit dark persists across reload', (await bgLuminance(p)) < 0.3, `lum=${await bgLuminance(p)}`);
await p.close();
```
- [ ] **Step 2: Run → S6b FAILS (no radio exists).**
- [ ] **Step 3: options.html** — add inside the URL tab:

```html
<div class="setting-card">
    <h3>Appearance</h3>
    <div class="segmented" role="radiogroup" aria-label="Theme">
        <label><input type="radio" ng-model="theme" value="system" ng-change="changeTheme(theme)"> System</label>
        <label><input type="radio" ng-model="theme" value="light" ng-change="changeTheme(theme)"> Light</label>
        <label><input type="radio" ng-model="theme" value="dark" ng-change="changeTheme(theme)"> Dark</label>
    </div>
    <p class="hint">System follows your operating system's light/dark setting. Your choice applies to the new tab page, options, and welcome pages.</p>
</div>
```
- [ ] **Step 4: options_controller.js** — in `getOptions()` first `.then`, read the flag batch as `Storage.getLocal(['syncOptions', 'theme'])` and set `$scope.theme = (result.theme === 'light' || result.theme === 'dark') ? result.theme : 'system';` Add:

```js
$scope.changeTheme = function (selected) {
    var theme = (selected === 'light' || selected === 'dark') ? selected : 'system';
    Storage.saveLocal({'theme': theme});
    if ($scope.sync) {
        Storage.saveSync({'theme': theme});
    }
};
```
- [ ] **Step 5: Run suite → 13/13.**
- [ ] **Step 6: Commit; push; PR; CI; squash-merge.**

### Task 3: Options modern refresh — PR "feat/options-refresh"

**Files:**
- Modify: `options.html` (URL tab → five `.setting-card`s with `.hint` lines; Permissions tab wrapped in cards; quick-saves → `.chip-grid`), `css/options.css` (+ card/hint/chip/segmented styles on tokens), `css/common.css` (shared header/typography polish).

**Interfaces:** Consumes Task 1 tokens. Produces classes `.setting-card`, `.hint`, `.chip-grid`, `.segmented` (already used by Task 2's card).

- [ ] **Step 1:** Restructure the URL tab into the five cards (New tab opens / Address bar behavior / Sync across devices / Appearance / One-click save) with helper copy: blank-URL = Apps page + `file:///` note; always-update-tab = "navigates the tab instead of redirecting, which leaves the cursor in the address bar"; sync = opt-in + "roams via your browser account in Chrome; Edge and Brave don't roam extension data". Preserve every selector in Global Constraints verbatim.
- [ ] **Step 2:** `options.css`: cards (`background: var(--surface); border: 1px solid var(--border); border-radius: 10px; padding: 16px 18px; margin: 14px 0; box-shadow: 0 1px 3px var(--card-shadow);`), `.hint { color: var(--text-muted); font-size: 0.85em; margin: 6px 0 0; }`, `.chip-grid` as flex-wrap rows of pill links (`background: var(--chip-bg)`, hover `var(--chip-hover)`), `.segmented label` pills with checked state via `:has(input:checked)` (`background: var(--accent); color: var(--accent-contrast)`).
- [ ] **Step 3:** Run suite → 13/13 (selectors intact proves it).
- [ ] **Step 4:** Commit; push; PR; CI; squash-merge.

### Task 4: Image modernization — PR "feat/image-modernization"

**Files:**
- Create: `images/github-mark.svg` (official Primer Octicons mark-github, MIT), `images/chevron-left.svg`, `images/chevron-right.svg`, replacement `images/document-new.svg`
- Delete: `images/google_32.png`, `images/twitter_32.png`, `images/apps.png`, `images/sample.png`, `images/left.png`, `images/right.png`, `images/github_32.png`
- Modify: `css/common.css` (`.github-icon`, `.twitter-icon`/`.google-icon` rule removal, `document-new` block), `css/welcome.css` (nav arrows via mask, `.settings-link` handling), `images/README.md`

**Interfaces:** Consumes tokens (`var(--text)`, `var(--text-muted)`).

- [ ] **Step 1:** Fetch the official mark: `https://raw.githubusercontent.com/primer/octicons/main/icons/mark-github-16.svg` → `images/github-mark.svg`.
- [ ] **Step 2:** Author chevrons: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M15 4 L7 12 L15 20" fill="none" stroke="#000" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>` (mirrored path `M9 4 L17 12 L9 20` for right). Mask makes the stroke color irrelevant.
- [ ] **Step 3:** CSS swap to mask technique:

```css
.github-icon::before {
    content: "";
    display: inline-block;
    width: 18px;
    height: 18px;
    margin-right: 6px;
    vertical-align: -3px;
    background-color: var(--text);
    -webkit-mask: url(../images/github-mark.svg) no-repeat center / contain;
    mask: url(../images/github-mark.svg) no-repeat center / contain;
}
```
Delete the `.twitter-icon` and `.google-icon` rules. Same mask pattern for welcome nav buttons (`var(--text-muted)`, sized to the former left/right.png box).
- [ ] **Step 4:** Replace `document-new.svg` content with a minimal sheet+plus outline in `#8b93a1` (reads on both themes); inspect `.settings-link` (welcome.css:203) and either mask a gear SVG or drop the decorative background if it references removed art.
- [ ] **Step 5:** `git rm` the seven replaced/orphaned PNGs; rewrite `images/README.md` (all art now project-original MIT except Primer octicon, MIT, attributed).
- [ ] **Step 6:** Suite 13/13; eyeball welcome + options in both themes via screenshots.
- [ ] **Step 7:** Commit; push; PR; CI; squash-merge.

### Task 5: Welcome intro screenshots — same PR as Task 4

**Files:**
- Create: `scripts/intro-shots.mjs`; `images/screenshots/tabsetgo-options*.png` set
- Delete: `images/screenshots/NewTabRedirect-options*.png`, `images/screenshots/Chrome-Settings.png` (if not recaptured)
- Modify: `css/welcome.css` background URLs (lines ~152-208)

- [ ] **Step 1:** `scripts/intro-shots.mjs` (same launch pattern as `store-shots.mjs`): capture options base, URL field filled, Save clicked with "Options saved!" toast visible, sync checked, chips region — clipped to the `#intro_screenshot` display box's aspect (read exact px from `css/welcome.css` before capturing; `page.screenshot({ clip })`).
- [ ] **Step 2:** Update the six `welcome.css` `url(...)` lines to the new filenames; attempt `chrome://settings` capture for the settings preview, else remove that preview state and its list item.
- [ ] **Step 3:** Suite 13/13; commit into the Task 4 PR.

### Task 6: Privacy + store assets + wrap — PR "feat/publish-prep"

**Files:**
- Create: `PRIVACY.md`
- Modify: `scripts/store-shots.mjs` (light + dark options shots, welcome shot), `docs/store-listing.md` (screenshot list + privacy URL line), `CHANGELOG.md` (fold new work into the 4.0.0 sections)
- Regenerate: `docs/store-assets/*.png`, `dist/TabSetGo-v4.0.0.zip`

- [ ] **Step 1:** `PRIVACY.md`: no collection, no transmission, settings in browser storage + optional browser-account sync, no remote code, contact = repo issues. Link it from `docs/store-listing.md` and README credits section.
- [ ] **Step 2:** Extend `store-shots.mjs`: before each capture set theme via `chrome.storage.local.set({ theme: 'light' | 'dark' })`; outputs `options-light.png`, `options-dark.png`, `welcome.png`.
- [ ] **Step 3:** CHANGELOG 4.0.0: Added — theme system + PRIVACY.md; Changed — options refresh, image modernization. changes.txt v4.0.0 block gains one line for the theme + refreshed options.
- [ ] **Step 4:** Run `scripts/package.ps1`; verify zip includes `css/theme.css`, `js/theme.js`, new svgs, no deleted PNGs.
- [ ] **Step 5:** Suite 13/13; commit; push; PR; CI; squash-merge. Update `todo_tabsetgo.md` + `project_index.md` after merge.

## Self-Review

- Spec coverage: theme engine (T1), toggle+persistence (T2), options refresh (T3), images (T4), intro screenshots (T5), privacy/store/changelog/zip (T6) — all spec sections mapped.
- Placeholders: none; all code inline.
- Type consistency: `theme` key + `changeTheme` names consistent across T1/T2/T6; token names consistent T1→T3→T4.
