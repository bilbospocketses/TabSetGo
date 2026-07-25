# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Historical release notes prior to this file live in [changes.txt](changes.txt).

## [Unreleased]

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
