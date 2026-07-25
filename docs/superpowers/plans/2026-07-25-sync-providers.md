# TabSetGo Sync Providers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Universal opt-in settings roaming across all Chromium browsers via a provider abstraction: browser sync, synced local folder, WebDAV, Dropbox, OneDrive, Google Drive, plus manual export/import.

**Architecture:** Per-key LWW sync document; engine in the MV3 service worker (debounced push, alarm/startup pulls); providers as plain JS modules behind one interface; options picker UI; FakeProvider + local WebDAV server for e2e. `storage.local` stays authoritative; redirect path untouched.

**Tech Stack:** Plain JS (no build step), AngularJS options app, chrome.identity.launchWebAuthFlow + PKCE, Playwright e2e, node:http for the WebDAV test server.

## Global Constraints

- Branch via `pwsh C:/Users/jscha/.claude/scripts/git-new-branch.ps1`; squash-merge; absolute paths; repo `C:/Users/jscha/source/repos/TabSetGo`.
- Selector stability: all existing e2e selectors keep working; suite green before every merge (`npm --prefix C:/Users/jscha/source/repos/TabSetGo run test:e2e`).
- `storage.local.syncProvider` ∈ `off|browser|folder|webdav|dropbox|onedrive|gdrive` (default `off`); legacy `syncOptions===true` migrates to `browser` and keeps `syncOptions` true for 4.0.x compat; any other provider forces `syncOptions` false.
- Sync doc shape per spec §"Sync document and merge"; stamps in `storage.local.syncStamps`; missing stamp = 0; tie → local.
- OAuth client IDs only in `js/sync/config.js`; placeholders make providers report not-configured. Never invent real IDs.
- Version bump to **4.1.0** only in the final wrap task.
- ASCII-only in any PowerShell script.

---

### Task 1: Engine + browser provider + migration — PR "feat/sync-engine"

**Files:**
- Create: `js/sync/doc.js` (doc build/merge helpers), `js/sync/engine.js`, `js/sync/providers.js` (registry), `js/sync/providers/browser.js`, `js/sync/providers/fake.js`
- Modify: `js/background.js` (import engine via `importScripts`? No — SW is classic script; use `importScripts('sync/doc.js', ...)` at top; keep files classic-script style assigning to `self.TabSetGoSync` namespace), `manifest.json` (add `"alarms"` permission)
- Test: `tests/e2e/redirect.spec.mjs` S7a–S7d

**Interfaces produced:** `TabSetGoSync.engine.init()`, `.syncNow()`, `.setProvider(id)`; registry `TabSetGoSync.providers.get(id)/list()`; runtime message `{type:'tabsetgo-sync-now'}` handled in background.

Key notes: SETTINGS_KEYS = `['url','always-tab-update','theme']`. Engine listens to `chrome.storage.onChanged` (local) to bump stamps (skip keys in `applying` set), debounce-push 2s. Pull on `init()` (SW start), `chrome.alarms.create('tabsetgo-sync', {periodInMinutes: 15})`, and sync-now messages. Migration inside `init()`: if `syncProvider` unset and `syncOptions === true` → set `'browser'`; unset otherwise → `'off'`. Browser provider: push writes raw keys + `syncDoc` to `chrome.storage.sync`; pull prefers `syncDoc`, else raw keys with stamps 0. Fake provider: visible only when `__testFakeProvider` truthy; pull/push against `storage.local.__fakeRemote`.

- [ ] Step 1: failing tests S7a (migration), S7b (remote-newer key applies, older key doesn't), S7c (local change → `__fakeRemote` updated after ≤4s), S7d — reserved for Task 2 import (write in Task 2). Red run.
- [ ] Step 2: implement doc.js/engine.js/providers + background wiring + alarms permission.
- [ ] Step 3: green run (existing 16 + new). Commit, push, PR, CI, merge.

### Task 2: Options picker UI + export/import — PR "feat/sync-picker"

**Files:** Modify `options.html` (Sync card → provider picker; new Export/Import card), `js/options_controller.js` (provider list/status/connect/disconnect/syncNow via runtime messages + `changeSyncProvider`), `css/options.css` (picker rows). Create nothing new.
**Test:** S7d import-wins (file chooser via Playwright `setInputFiles`), S7e export download (Playwright `download` event, parse JSON, assert doc shape), plus picker migration display check.

Preserve `input[ng-model="sync"]`?? — the old checkbox is REPLACED by the picker; S2/S4/S5 tests use it. Contract update: keep a hidden compatibility checkbox? NO — instead update those scenarios minimally and consciously in the same PR (the ONE sanctioned selector change of this initiative): S2 seeds sync mode by `storage.local.set({syncProvider:'browser', syncOptions:true})` instead of clicking; S5a–c assert picker state via `input[ng-model="providerChoice"][value="browser"]` checked-ness. Document in PR body.

- [ ] Step 1: red for S7d/S7e; step 2: implement; step 3: full green; commit/PR/merge.

### Task 3: Folder + WebDAV providers — PR "feat/sync-folder-webdav"

**Files:** Create `js/sync/providers/folder.js` (IndexedDB handle store `tabsetgo-sync/handles`, options-page `connect()` gated `typeof showDirectoryPicker === 'function'`; verify SW handle usability — if `queryPermission`/`getFile` unavailable in SW, set provider flag `pageContextOnly: true` and engine additionally pulls/pushes from options + main pages), `js/sync/providers/webdav.js` (config `{baseUrl, username, appPassword}` → `GET/PUT <base>/tabsetgo-settings.json`, Basic auth, treat 404 pull as null). Modify options picker rows (folder connect button + reauthorize badge; webdav credential mini-form; availability copy for folder with the two durable links — **verify both URLs respond 200 at implementation time**: MDN `showDirectoryPicker` compatibility page + Brave's official brave-browser GitHub issue on disabling the File System Access API).
**Test:** S8 WebDAV real roundtrip — test spawns `node:http` server (in-memory PUT/GET store) on a free port, configures provider, asserts push lands + pull merges. Folder provider: unit-ish availability test only (picker gesture not automatable) + manual checklist note.

- [ ] Red (S8) → implement → green → merge.

### Task 4: OAuth trio (code + setup docs) — PR "feat/sync-oauth"

**Files:** Create `js/sync/config.js` (placeholder client IDs), `js/sync/oauth.js` (PKCE helpers: verifier/challenge via crypto.subtle, launchWebAuthFlow wrapper, token store/refresh), `js/sync/providers/dropbox.js` (`/2/files/upload` + `/2/files/download` path `/settings.json`, app-folder token), `js/sync/providers/onedrive.js` (Graph `special/approot:/tabsetgo/settings.json:/content` GET/PUT wait — approot root file: `special/approot:/settings.json:/content`), `js/sync/providers/gdrive.js` (appDataFolder: files.list q=`name='settings.json'` spaces=appDataFolder; multipart create/patch; silent re-auth). Create `docs/oauth-setup.md` (exact console walkthroughs for Dropbox App Console, Azure app registration incl. MPN publisher verification pointer, Google Cloud consent + sensitive-scope verification checklist; redirect URI table with dev + future store IDs).
**Test:** providers report not-configured cleanly in picker (e2e asserts row disabled state); token/PKCE helpers get a pure-function e2e page-eval test (challenge derivation vector). Auth flows: manual checklist in `docs/oauth-setup.md`, explicitly untested until console IDs exist.

- [ ] Implement → suite green → merge.

### Task 5: Wrap — PR "feat/sync-wrap"

**Files:** Modify `PRIVACY.md` (+cloud-provider paragraph per spec), `docs/store-listing.md` (description gains sync bullet; privacy answers updated), `README.md` (features + sync section), `CHANGELOG.md` (`[4.1.0]` cut), `changes.txt` (v4.1.0 block), `manifest.json` + `package.json` → 4.1.0.
- [ ] Suite green → `scripts/package.ps1` → verify zip contains `js/sync/**` → merge. Update `todo_tabsetgo.md` (+ store-upload gating note: upload 4.1.0 after 4.0.0 approved) + `project_index.md`.

## Self-Review

Spec coverage: engine/doc (T1), migration (T1), picker+export/import (T2), folder+webdav+durable links (T3), dropbox/onedrive/gdrive+oauth docs (T4), privacy/listing/version (T5). No placeholders beyond deliberate not-configured client IDs. Names consistent: `syncProvider`, `syncStamps`, `syncDoc`, `TabSetGoSync`, message `tabsetgo-sync-now`.
