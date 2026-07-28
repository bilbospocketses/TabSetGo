# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Historical release notes prior to this file live in [changes.txt](changes.txt).

## [Unreleased]

## [4.1.0] - 2026-07-25

### Removed

- Unused vendored libraries no longer ship: the extension pages load only
  `angular-loader.min.js` and `angular.min.js`, but the package carried the
  entire AngularJS family (scenario test harness, mocks, sanitize, route,
  touch, resource, cookies, animate, unminified builds, `errors.json`) plus
  jQuery 1.10.2. All of it is gone — smaller install, and it clears the
  code-scanning alerts those dead files generated. The repo's `example.html`
  demo (not part of the package) also no longer pulls jQuery from a
  plain-HTTP CDN; it is self-contained now.

### Added

- Universal settings sync across all Chromium browsers via pluggable
  providers: Browser sync (Chrome-only roaming, as before), a synced local
  folder (rides the OneDrive / Google Drive for Desktop / Dropbox / Syncthing
  desktop clients), WebDAV (Nextcloud, ownCloud, Synology, or any server),
  plus Dropbox, OneDrive, and Google Drive cloud providers (these activate
  once their one-time app registrations in `docs/oauth-setup.md` are
  completed). Per-key last-writer-wins merge; `storage.local` stays
  authoritative and new tabs never wait on the network.
- Settings export/import as a JSON file — imports deliberately win over
  synced values everywhere.

### Changed

- The sync checkbox became a provider picker with per-provider status,
  connect flows, and a Sync now button. The synced-folder row self-disables
  with an explanation (and citations) in browsers that remove the File
  System Access API, such as Brave.

### Fixed

- All three host permissions shipped since the MV3 migration
  (`*://*`, `file://`, `file:///`) were invalid match patterns that Chrome
  silently ignored, leaving the extension with no host access — which broke
  favicon rendering on the quick-save chips and any cross-origin fetch. Now
  `<all_urls>`.

## [4.0.0] - 2026-07-25

### Added

- Theme system: follows the OS by default with a System / Light / Dark choice
  in options, applied across the new tab, options, and welcome pages via CSS
  tokens with a pre-paint stamp (no white flash on new tabs). The choice
  roams with the sync opt-in like other settings.
- `PRIVACY.md` — no collection, no transmission, no remote code.
- Store submission tooling: `scripts/package.ps1` builds the runtime-only
  submission zip, `docs/store-listing.md` carries the listing copy, privacy
  disclosures, and per-store walkthroughs, and `scripts/store-shots.mjs`
  captures the 1280×800 listing screenshots (light + dark) in
  `docs/store-assets/`.

### Changed

- Options page modernized into labeled setting cards with plain-language
  helper text under every control; quick saves became chips.
- Legacy images modernized: official Octicons GitHub mark and hand-authored
  chevrons rendered as theme-aware CSS masks, orphaned 2012-era art removed,
  welcome intro previews regenerated from the live UI
  (`scripts/intro-shots.mjs`).

- Rebranded to **TabSetGo** — a hard fork of
  [New Tab Redirect](https://github.com/jimschubert/NewTab-Redirect) by
  Jim Schubert (MIT, with attribution). New name, new icons, and rewritten
  in-app pages: the donation page and personal contact details are gone, bug
  reports go to this repository's issue tracker, and the legacy one-shot
  `upgraded/3.1.html` page (unreachable since v3.2) was removed.

### Fixed

- The background mirror copied incoming sync changes into local storage even
  with the sync option turned off (loose equality let boolean `false`
  through), so another machine could silently overwrite this machine's
  redirect URL. Sync is now strictly opt-in everywhere.
- The sync checkbox state itself never reached `storage.sync`, so the
  install-time restore on a second machine could never trigger. Toggling sync
  now persists the flag to both storage areas.
- Legacy string values of the sync flag (`"true"`/`"false"` from
  pre-storage-API versions) put the options page in the wrong mode — a
  missing or string-`"false"` flag counted as sync-*on*. Flags are normalized
  to booleans at worker start and options load, and sync only engages on an
  explicit `true`.

### Added

- Playwright E2E harness (`tests/e2e/`) covering the storage self-heal,
  same-value-save repair, and the normal local-mode redirect, plus a GitHub
  Actions workflow running it on every push and pull request.

## [3.2.0] - 2026-07-25

### Fixed

- Redirect URL ignored (the New Tab Redirect apps page shown instead) when the
  local copy of settings was lost while the synced copy survived. The new tab
  page now falls back to `storage.sync` and repairs `storage.local`, so the
  next tab takes the fast path again.
  ([upstream #235](https://github.com/jimschubert/NewTab-Redirect/issues/235))
- Clicking **Save** without changing the URL could not repair a broken state:
  options saved only to `storage.sync` and the background mirror relies on
  `storage.onChanged`, which Chrome does not fire for same-value writes.
  Options now always write `storage.local` (what the new tab page reads)
  directly, plus `storage.sync` when the sync option is enabled.
- Crash in the background service worker's initial setup (`JSON.parse` called
  on an object), which could leave a fresh install without default settings.
