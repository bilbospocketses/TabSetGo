# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Historical release notes prior to this file live in [changes.txt](changes.txt).

## [Unreleased]

## [4.0.0] - 2026-07-25

### Changed

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
