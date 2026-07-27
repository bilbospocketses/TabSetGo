# Store submission guide — Chrome Web Store & Edge Add-ons

A step-by-step walkthrough for publishing TabSetGo to both stores. Work each
store's section from top to bottom. The listing text both stores ask for is
staged once in [Shared listing content](#shared-listing-content) and
[Privacy answers](#privacy-answers) so you paste the same answers into both
consoles.

**Copy/paste convention used in this document:** every piece of text you need
to paste into a store form sits in a fenced block like this:

```text
Example — copy exactly what is inside the box, nothing else.
```

On GitHub, hover over a block and click the copy icon in its top-right corner
to grab the exact text with no markdown markers. Paragraphs inside the blocks
are intentionally single long lines: they paste into store text fields without
stray mid-paragraph line breaks.

## Step 1 — Build the zip

1. Open PowerShell in the repo root.
2. Run:

```powershell
pwsh scripts/package.ps1
```

3. The package lands at `dist/TabSetGo-v<version>.zip` (runtime files only —
   no docs, tests, or CI). Upload the **same zip to both stores**.

## Shared listing content

### Name and summary — already inside the zip

Both stores read the extension **name** and the **short summary** from the
uploaded zip's `manifest.json` (`name` and `description` fields), so there is
nothing to paste for these. For reference, the shipped values are:

- **Name:** TabSetGo
- **Summary** (≤132 chars; also paste it manually if a console shows an
  editable "short description" field):

```text
Ready, set, go: every new tab opens the URL you choose. Self-healing settings and optional cross-device sync.
```

### Category — a dropdown, not a text field

- Chrome Web Store: **Productivity → Tools**
- Edge Add-ons: **Productivity**

### Detailed description — paste into both stores

```text
TabSetGo replaces your browser's new tab page with any URL you choose — a website, an internal dashboard, a chrome:// page, or even a local HTML file you built yourself. Leave the URL blank to get TabSetGo's built-in Apps page: a clean new tab with a focused address bar, optional top sites, and an optional bookmarks bar.

Settings are stored locally and are self-healing: if the browser ever loses the local copy (interrupted writes, profile hiccups), TabSetGo silently restores it from your synced copy instead of forgetting your URL. Cross-device sync of your settings is strictly opt-in.

And sync works in every Chromium browser — not just Chrome. Pick your transport: your browser account, a synced folder (OneDrive, Google Drive for Desktop, Dropbox, Syncthing), your own WebDAV server (Nextcloud and friends), or connect Dropbox, OneDrive, or Google Drive directly. You can also download your settings as a file and load them anywhere.

TabSetGo is free and open source (MIT): https://github.com/bilbospocketses/TabSetGo
It is a maintained hard fork of "New Tab Redirect" by Jim Schubert, with attribution — rebuilt to fix the long-standing "extension forgets my URL" bug (upstream issue #235) and the sync-clobber bug (#229).

Permissions are minimal and explained inside the extension's options page. No data is collected or transmitted anywhere; your settings live in browser storage (and your browser account's sync, only if you opt in).
```

### Screenshots — upload to both stores

All three live in `docs/store-assets/` at 1280×800:

| File | Shows |
|---|---|
| `options-light.png` | Options page, light theme |
| `options-dark.png` | Options page, dark theme |
| `welcome.png` | Welcome page |

Upload the light **and** dark options shots so both themes are represented.

### Store icon

The in-package icons ship inside the zip. If a console asks you to upload a
store-listing icon separately, use `images/icon128.png`; if it wants a larger
size, the 512 px master is `docs/store-assets/icon512.png`.

### Privacy policy URL — paste into both stores

```text
https://github.com/bilbospocketses/TabSetGo/blob/master/PRIVACY.md
```

## Privacy answers

Both stores ask some form of these questions. Chrome's are on the item's
**Privacy** tab; Edge's are spread across **Properties** and the submission
form.

### Single purpose

```text
Replaces the browser's new tab page with a user-chosen URL.
```

### Data collection

TabSetGo collects **nothing** — no analytics, no external requests. Settings
persist in `chrome.storage.local`, plus `chrome.storage.sync` only when the
user opts into sync. In Chrome's "Data usage" checklist that means: tick
**none** of the data-type boxes, then tick the three certification statements
(data is not sold or transferred to third parties, not used for purposes
unrelated to the single purpose, not used to determine creditworthiness).

### Remote code

Answer **No** — all scripts are bundled with the extension (AngularJS is
vendored). Nothing is loaded from the network.

### Permission justifications — check which version you are uploading

The console shows one justification box per permission **found in the uploaded
zip**, so the set differs by version:

- **v4.0.0 zip:** `storage`, `favicon`, host permissions
  (`file:///`, `file://`, `*://*`), and the four optional permissions.
- **v4.1.0 zip:** adds `alarms`, and host permissions widen to `<all_urls>`.

`storage`:

```text
Saves the user's redirect URL and preferences.
```

`favicon`:

```text
Renders site icons for bookmarks and top sites on the built-in Apps page and for the quick links on the options page.
```

Host permissions — when uploading **v4.0.0**:

```text
Required for the favicon API to resolve icons for arbitrary user bookmarks, and to allow redirecting new tabs to any user-chosen URL, including local files.
```

Host permissions — when uploading **v4.1.0**:

```text
Required for the favicon API to resolve icons for arbitrary user bookmarks, to allow redirecting new tabs to any user-chosen URL including local files, and — only when the user opts into cloud sync — to talk directly to the sync provider the user chose (their own WebDAV server, or the Dropbox/Microsoft/Google APIs).
```

`alarms` — **v4.1.0 only** (the box will not appear for the 4.0.0 upload):

```text
Schedules the periodic background sync pull (15-minute interval) when the user has enabled a sync provider.
```

Optional permissions `tabs` / `topSites` / `management` / `bookmarks` (one
box each; the same answer fits all four):

```text
Powers optional features of the built-in Apps page (top sites, bookmarks bar, installed-apps list). Requested at runtime only if the user enables the feature, and can be denied or revoked at any time from the options page.
```

Heads-up: broad host permissions can draw a closer review. The favicon
justification above is the honest answer if a reviewer asks follow-up
questions.

## Chrome Web Store — walkthrough

### One-time account setup

1. Go to https://chrome.google.com/webstore/devconsole
2. Sign in with the Google account that should **own the listing**. Ownership
   is permanent-ish (transfers are painful) — choose deliberately.
3. Pay the one-time $5 developer registration fee when prompted.
4. In the console's **Account** tab, complete the trader declaration. For a
   free, open-source, personal extension declare **non-trader** (flip to
   trader only if it ever monetizes).

### Create and submit the item

1. On the Developer Dashboard, click **+ New item** (top right).
2. Upload `dist/TabSetGo-v4.0.0.zip` (drag it in or browse to it).
3. Open the **Store listing** tab:
   - Paste the [detailed description](#detailed-description--paste-into-both-stores).
   - Category: **Productivity → Tools**.
   - Language: English.
   - Upload the three [screenshots](#screenshots--upload-to-both-stores).
   - Title and summary are already filled from the zip's manifest.
4. Open the **Privacy** tab and work top to bottom with the
   [privacy answers](#privacy-answers): single purpose, one justification per
   permission (use the **v4.0.0** variants), data-usage checkboxes,
   remote-code answer, and the privacy policy URL.
5. Open the **Distribution** tab: visibility **Public**, all regions, free
   (no in-app purchases).
6. Click **Submit for review** (top right). Leaving "publish automatically
   after review" enabled is the usual choice.
7. Review typically clears in **1–3 days** for simple extensions; the broad
   host permissions may add scrutiny (see the heads-up above).
8. Once live, note the listing URL — the 32-character tail is the extension's
   **store ID**, needed for the OAuth redirect URIs in
   [`docs/oauth-setup.md`](oauth-setup.md).

## Edge Add-ons — walkthrough

### One-time account setup — personal Microsoft account, NOT a work/AAD account

Microsoft requires the Partner Center **developer** account for Edge
extensions to be owned by a **personal Microsoft account (MSA)** — a
commercial AAD/Entra work account cannot enroll (Microsoft's own guidance on
MicrosoftEdge-Extensions issue #566 and the docs at
https://learn.microsoft.com/microsoft-edge/extensions/publish/aad-account).
If you ever land on a page telling you to "use a business account", you have
wandered into the *AI Cloud Partner Program* flow — wrong front door; use the
direct URL below.

1. Open a **fresh InPrivate window** (avoids sticky sign-in state from other
   Microsoft accounts).
2. Go directly to:

```text
https://partner.microsoft.com/en-us/dashboard/account/exp/enrollnow/msedgeaddons
```

3. Sign in with a **personal MSA** — a fresh, dedicated `@outlook.com`
   account is the recommended clean slate.
4. Register as **Individual** (the Company path requires a D-U-N-S number and
   has been extra fragile).
5. The **publisher display name** is free text — it can read `BoxTechs` even
   on an Individual registration.
6. Form gotchas: every field is manual entry (no autofill); the phone number
   wants its area code entered explicitly; and when the address-verification
   (AVS) dialog suggests a corrected address, explicitly accept or fix it —
   don't dismiss it.
7. If the **Accept and continue** button does nothing and the browser console
   shows a `ViewBage` error, the known Partner Center platform regression is
   back: reply on MicrosoftEdge-Extensions issue #566 and open a Partner
   Center support ticket.
8. Optional, afterward: link the BoxTechs Entra tenant to the account so
   work-account users can sign in too.

Registration is free — no fee.

### Create and submit the extension

1. In Partner Center, open the **Microsoft Edge** program → **Create new
   extension**.
2. Upload the **same zip** you sent to Chrome.
3. **Availability**: visibility **Public**.
4. **Properties**: category **Productivity**; paste the
   [privacy policy URL](#privacy-policy-url--paste-into-both-stores); point
   support/homepage links at the GitHub repo.
5. **Store listings**: paste the same
   [detailed description](#detailed-description--paste-into-both-stores) and
   upload the same [screenshots](#screenshots--upload-to-both-stores).
6. Optional but useful — in **Notes for certification**, paste the
   host-permission justification so the reviewer has the explanation up
   front.
7. Submit. Edge review typically takes **up to ~7 days**.
8. Once live, the listing URL's trailing segment is the **Edge store ID**,
   needed for [`docs/oauth-setup.md`](oauth-setup.md).

Note: Edge syncs the *list* of installed extensions across devices, but
extension storage does not roam — TabSetGo settings are per-machine on Edge
(the in-app welcome page says so too).

## After both listings are live

1. Update the README.md "Install" section with the two store links.
2. Tag `v4.0.0` and create a GitHub release with the shipped zip attached.
3. Register the two store extension IDs in the OAuth consoles — see
   [`docs/oauth-setup.md`](oauth-setup.md).
4. After the 4.0.0 listing is approved, upload `dist/TabSetGo-v4.1.0.zip` the
   same way (same description; use the **v4.1.0** permission justifications —
   the new `alarms` box and the widened host permissions).
