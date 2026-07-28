# Contributing to TabSetGo

Thanks for your interest. This document covers getting a development copy running, the code-style bar, and how to land changes.

## Prerequisites

- **A Chromium-based browser** (Chrome, Edge, Brave, Opera) — the extension targets Manifest V3 Chromium; there is no Firefox build
- **Node.js 20+** — only for the e2e test tooling; the extension itself has **no build step and no runtime npm dependencies**
- **PowerShell 7 (`pwsh`)** — for the repo scripts (`scripts/package.ps1`, `scripts/make-icons.ps1`, screenshot generators)

## Setup

```bash
git clone https://github.com/bilbospocketses/TabSetGo.git
npm ci            # installs playwright (dev/test tooling only)
```

To run the extension from source: open `chrome://extensions`, switch on **Developer mode** (top right), click **Load unpacked**, and select the repo folder (the one containing `manifest.json`). Reload the card after edits.

## Development Workflow

```bash
npm run test:e2e          # full Playwright e2e suite (launches real Chromium with the extension loaded)
pwsh scripts/package.ps1  # build the store zip -> dist/TabSetGo-v<version>.zip
```

## Project Structure

```
manifest.json        MV3 manifest — permissions, service worker, overrides
js/                  Extension logic (plain JS, IIFE namespaces, no build step)
├── sync/            Sync engine + providers (browser/folder/WebDAV/Dropbox/OneDrive/GDrive, PKCE plumbing, config.js client IDs)
css/                 Styles + theme tokens (css/theme.css)
images/              Icons and UI art
tests/e2e/           Playwright suite (portable EXT_PATH)
scripts/             Packaging, icon generation, store screenshots (PowerShell + Node)
docs/                Store listing walkthrough, OAuth console setup, specs/plans
```

## Code Style

- **Plain JavaScript, no build step.** Match the surrounding file: IIFE namespace modules (`self.TabSetGoSync = …` style), `'use strict'`, no new frameworks or bundlers.
- The options/welcome pages use the **vendored AngularJS 1.x** — extend existing patterns; don't introduce a second framework.
- **Storage architecture is load-bearing:** `storage.local` is the source of truth for the new-tab page; `storage.sync` is the opt-in roaming backup. Never add a sync-only save path; sync engages only on an explicit boolean `true`.
- Keep host-permission and API usage minimal — the store listings justify every permission, and new ones need matching justification text in `docs/store-listing.md`.

## Tests

The e2e suite (`tests/e2e/`, Playwright) launches a real Chromium with the extension loaded and exercises redirect behavior, save semantics, sync opt-in, legacy migration, themes, and the sync engine end to end.

Any PR that changes storage semantics, the service worker, or sync behavior MUST include or update e2e coverage. Bug fixes follow red/green: land the failing expectation first, then the fix.

The cloud-provider OAuth flows require real vendor accounts and are covered by the manual smoke checklist in `docs/oauth-setup.md` instead of the automated suite.

## Commit Messages

Short, imperative subject lines. Wrap bodies at 72 columns. Reference issue numbers when applicable.

Do not include AI-generated attribution lines in commit messages.

## Pull Requests

- Keep PRs focused on one concern.
- Update `CHANGELOG.md` under `[Unreleased]` for any user-visible change.
- Update the relevant `docs/` file when behavior it describes changes.

## Branch Strategy

`master` is the development branch and is **PR-gated**. Direct pushes are blocked at the ruleset level; every change goes branch → PR → required checks green → squash-merge.

**Required status checks:**
- `e2e` — the Playwright suite on ubuntu-latest
- `CodeQL` — GitHub code-scanning result (default setup). Required as the single `CodeQL` context — not the per-language `Analyze (...)` jobs — so dependency-only PRs aren't permanently blocked.
- `Scorecard analysis` — OpenSSF supply-chain scoring

**Merge method:** squash only. Rebase is disallowed (it would skip GitHub's web-flow signature on the landing commit, failing the `required_signatures` rule).

**Signed commits required** on `master` and on `v*` tags.

**Workflow file edits:** any change to `.github/workflows/*.yml` must SHA-pin every action to the underlying **commit** SHA (not the annotated-tag object SHA) with a precise version comment (`# vX.Y.Z`, never bare `# v4`). Repo-level `sha_pinning_required=true` enforces the SHA shape; the comment convention keeps Dependabot tracking bumps. The inline comments in `.github/workflows/scorecard.yml` explain the gotchas.

## Reporting Bugs

Open an issue on GitHub with:

- Expected vs actual behavior
- Browser + version, OS, and the TabSetGo version (from `chrome://extensions`)
- Whether sync is enabled and which provider
- Any errors from the service worker console (`chrome://extensions` → TabSetGo → "service worker") or the page console

## Reporting Security Issues

Do **not** file a public issue. See [`SECURITY.md`](SECURITY.md) for the private reporting flow.

## Naming

TabSetGo is a maintained hard fork of "New Tab Redirect" by Jim Schubert (MIT, attribution in `LICENSE` and the in-app credits). Contributions must not present the project as "New Tab Redirect" — the name stays TabSetGo everywhere user-facing.

## License

By contributing you agree your contributions are licensed under the project's MIT license.
