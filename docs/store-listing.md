# Store submission — listing copy & walkthrough

Everything needed to publish TabSetGo to both stores. The only steps that
require a human are account registration and the actual uploads.

## Package

```
pwsh scripts/package.ps1
```

Produces `dist/TabSetGo-v<version>.zip` (runtime files only). Upload the same
zip to both stores.

## Listing copy (both stores)

- **Name:** TabSetGo
- **Summary / short description** (≤132 chars):
  > Ready, set, go: every new tab opens the URL you choose. Self-healing settings and optional cross-device sync.
- **Category:** Productivity → Tools (Chrome) / Productivity (Edge)
- **Detailed description:**

  > TabSetGo replaces your browser's new tab page with any URL you choose — a
  > website, an internal dashboard, a chrome:// page, or even a local HTML
  > file you built yourself. Leave the URL blank to get TabSetGo's built-in
  > Apps page: a clean new tab with a focused address bar, optional top
  > sites, and an optional bookmarks bar.
  >
  > Settings are stored locally and are self-healing: if the browser ever
  > loses the local copy (interrupted writes, profile hiccups), TabSetGo
  > silently restores it from your synced copy instead of forgetting your
  > URL. Cross-device sync of your settings is strictly opt-in.
  >
  > TabSetGo is free and open source (MIT):
  > https://github.com/bilbospocketses/TabSetGo
  > It is a maintained hard fork of "New Tab Redirect" by Jim Schubert, with
  > attribution — rebuilt to fix the long-standing "extension forgets my
  > URL" bug (upstream issue #235) and the sync-clobber bug (#229).
  >
  > Permissions are minimal and explained inside the extension's options
  > page. No data is collected or transmitted anywhere; your settings live
  > in browser storage (and your browser account's sync, only if you opt in).

- **Screenshots:** `docs/store-assets/` (1280×800): options in light and dark
  (`options-light.png`, `options-dark.png`), welcome (`welcome.png`).
- **Icon:** `images/icon128.png` (store listing icon; 512px master in
  `docs/store-assets/icon512.png`).
- **Privacy policy URL:** https://github.com/bilbospocketses/TabSetGo/blob/master/PRIVACY.md

## Privacy disclosures

- **Single purpose:** Replaces the browser's new tab page with a
  user-chosen URL.
- **Data collected:** none. No analytics, no remote code, no external
  requests. Settings persist in `chrome.storage.local`, plus
  `chrome.storage.sync` when the user opts into sync.
- **Permission justifications:**
  - `storage` — save the redirect URL and preferences.
  - `favicon` — render site icons for bookmarks/top sites on the built-in
    Apps page and options quick-links.
  - Host permissions (`*://*`, `file://`) — required for the favicon API to
    resolve icons for arbitrary user bookmarks, and to allow redirecting new
    tabs to any user-chosen URL including local files.
  - Optional `tabs` / `topSites` / `management` / `bookmarks` — power the
    built-in Apps page features; requested at runtime only if the user
    enables those features, deniable at any time in options.
- **Remote code:** none (all scripts bundled; AngularJS vendored).

## Chrome Web Store — steps (user)

1. Register a developer account at
   https://chrome.google.com/webstore/devconsole (one-time $5 fee; pick which
   Google account owns the listing — this is permanent-ish, choose deliberately).
2. "New item" → upload `dist/TabSetGo-v<version>.zip`.
3. Fill the listing (copy above), Privacy tab (disclosures above),
   distribution: Public, all regions.
4. Submit for review. Simple extensions typically clear in 1–3 days. The
   broad host permissions may trigger a closer look — the favicon
   justification above is the honest answer if a reviewer asks.

## Edge Add-ons — steps (user)

1. Register at https://partner.microsoft.com/dashboard/microsoftedge/overview
   (free; sign in with the MSA/work account that should own the listing).
2. "Create new extension" → upload the same zip.
3. Same listing copy + privacy answers. Edge review is typically up to ~7 days.
4. Note: Edge syncs the *list* of installed extensions across devices, but
   extension storage does not roam — TabSetGo settings are per-machine on
   Edge (the in-app welcome page says so too).

## After both listings are live

- Update README.md "Install" section with the two store links.
- Consider a GitHub release tagging the shipped zip (`v4.0.0`).
