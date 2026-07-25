# TabSetGo

[![e2e](https://github.com/bilbospocketses/TabSetGo/actions/workflows/e2e.yml/badge.svg)](https://github.com/bilbospocketses/TabSetGo/actions/workflows/e2e.yml)

Ready, set, go: every new tab opens the URL you choose.

TabSetGo is a hard fork of [New Tab Redirect](https://github.com/jimschubert/NewTab-Redirect)
by Jim Schubert (MIT, with attribution — the original author explicitly
welcomed renamed forks). The fork exists because the original is unmaintained
and suffered from a long-standing settings bug; see *What the fork fixes* below.

## Features

Sets a custom URL to load in new tabs. Choose from:

* Chrome's about pages
* NewTab, Extensions, Downloads, History
* Popular URLs
* Your own URL — including a local file (`file:///...`), so you can build your
  own new tab page
* Or leave the URL blank for the built-in Apps page (clear, focused address
  bar, optional top sites + bookmarks bar)
* Light and dark themes — follows your OS by default, with a System / Light /
  Dark choice in options, applied across all pages with no white flash

Settings sync across machines is **opt-in** (options page → "Sync this URL
across browsers?"). It rides your browser's account sync, so it works in
Chrome when you're signed in with sync on; Edge and Brave don't roam extension
data, so settings stay per-machine there.

**Important:** this replaces new tabs only, not your homepage. If your
homepage is set to the New Tab page, there may be odd consequences.

## What the fork fixes

The original extension's new tab page read `storage.local` while its options
page (in sync mode) wrote only `storage.sync`, bridged by a background mirror
that Chrome never triggers for same-value writes. Once the local copy of your
URL was lost, re-saving it could never repair the extension — every new tab
showed the built-in apps page instead
([upstream #235](https://github.com/jimschubert/NewTab-Redirect/issues/235)).

TabSetGo makes the settings store self-healing (the new tab page falls back to
the synced copy and repairs local storage), saves always write the store the
new tab page actually reads, and makes sync strictly opt-in — other machines
can no longer overwrite your URL while sync is off. See
[CHANGELOG.md](CHANGELOG.md) for the full list.

## Install

* Chrome Web Store / Edge Add-ons: listings coming soon.
* From source: clone this repo, open `chrome://extensions`, enable Developer
  mode, click **Load unpacked**, and select the repo folder.

### Missing local files?

To redirect to a `file:///` URL, go to `chrome://extensions`, open TabSetGo's
**Details**, and toggle on **Allow access to file URLs**.

### Omnibar focus

With the built-in Apps page you can type straight into the address bar. With a
custom URL, the browser controls address bar focus and extensions cannot
change it — `CTRL+L` jumps to the address bar.

## Development

Plain JavaScript, no build step. The only tooling is the E2E test suite:

```
npm ci
npm run test:e2e
```

The suite loads the unpacked extension in Chromium (new headless) via
Playwright and covers the self-heal path, save semantics, and the sync opt-in.
CI runs it on every push and pull request.

## Credits & license

No data collection, no telemetry, no external requests — see
[PRIVACY.md](PRIVACY.md).

MIT — see [LICENSE](LICENSE). Based on New Tab Redirect, © Jim Schubert.
AngularJS (MIT), Font Awesome (MIT/SIL OFL 1.1). Some images carry their own
licenses — see [images/README.md](images/README.md).

*Google Chrome is a trademark of Google, Inc.; Microsoft Edge is a trademark
of Microsoft Corporation. This project is affiliated with neither.*
