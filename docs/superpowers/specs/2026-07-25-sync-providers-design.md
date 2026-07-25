# TabSetGo universal settings sync: provider-based roaming for every Chromium browser

Approved in-session 2026-07-25 ("engage" after design + provider-lineup review).

## Problem

`chrome.storage.sync` roams only inside Chrome signed into a Google account.
Edge, Brave, and Opera implement the API surface but do not roam extension
data, and nothing roams *between* different browsers. TabSetGo needs one sync
mechanism that behaves identically in every Chromium variant.

## Core semantics (unchanged invariants)

- **`storage.local` remains the source of truth.** A new tab never waits on
  the network. `js/redirect.js` is untouched (its existing browser-sync
  read-time fallback stays).
- Sync is an **opt-in roaming backup** behind a single active provider.
- Settings payload: `url`, `always-tab-update`, `theme` (~200 bytes).

## Sync document and merge

```json
{
  "version": 1,
  "updatedAt": 1753481000000,
  "settings": { "url": "...", "always-tab-update": false, "theme": "system" },
  "stamps":   { "url": 1753481000000, "always-tab-update": 0, "theme": 0 }
}
```

- **Merge = per-key last-writer-wins** by stamp (missing stamp = 0; tie →
  local wins). Merged result is written back to `storage.local` and pushed.
- Local stamps live in `storage.local.syncStamps`; the service worker bumps a
  key's stamp on `storage.onChanged` for that key unless the engine itself is
  applying a remote value (in-memory applying-set guard; a SW restart
  mid-apply at worst re-pushes identical values — harmless).

## Engine (service worker)

- **Push:** settings/stamp change → debounce ~2s → `provider.push(doc)`.
  Failures surface in options status and retry at the next alarm.
- **Pull:** SW startup, `chrome.alarms` every 15 minutes, options page open
  ("sync now" runtime message), manual Sync-now button.
- Provider selection: `storage.local.syncProvider` ∈
  `off | browser | folder | webdav | dropbox | onedrive | gdrive`.
- **Migration:** legacy `syncOptions === true` → `syncProvider = 'browser'`
  (and `syncOptions` stays `true` only in that case, keeping the 4.0.x
  background mirror and redirect fallback semantics working unchanged).

## Provider interface

```js
{ id, label,
  isAvailable(): { ok, reason? },   // e.g., API missing, not configured
  connect(opts): Promise<void>,     // OAuth / folder picker / credentials
  disconnect(): Promise<void>,
  pull(): Promise<doc | null>,
  push(doc): Promise<void>,
  status(): Promise<{ connected, detail?, lastSync? }> }
```

Plain JS modules under `js/sync/` (no build step). Registry in
`js/sync/providers.js`.

## Providers (final lineup — nothing else)

1. **Browser sync** (`browser`) — the existing `chrome.storage.sync`
   mechanism refactored behind the interface. Honestly labeled "roams in
   Chrome only". Backward compatible with 4.0.x peers: continues writing the
   raw keys; additionally stores the doc under `storage.sync.syncDoc`
   (old clients ignore it; engine prefers it, treats raw-keys-only as
   stamp 0).
2. **Synced local folder** (`folder`) — `showDirectoryPicker()` from the
   options page; handle persisted in IndexedDB; `tabsetgo-settings.json`
   in the chosen folder (inside OneDrive/Drive-for-Desktop/Dropbox/Syncthing
   etc. — the desktop client roams it). Availability-gated with honest UI
   copy: unavailable where the File System Access API is disabled (Brave
   does so by design), citing durable links (MDN compatibility table +
   Brave's official GitHub issue) — exact URLs resolved and link-checked at
   implementation time. Permission may re-prompt after browser restarts;
   options shows a "re-authorize" nudge. If stored handles prove unusable
   from the MV3 service worker, fallback design: folder pulls/pushes run
   from extension page contexts (options/new-tab load) instead of the SW.
3. **WebDAV** (`webdav`) — base URL + username + app-password (UI copy
   recommends app-passwords). `PUT`/`GET <base>/tabsetgo-settings.json`,
   Basic auth. Host permissions bypass CORS. Covers Nextcloud, ownCloud,
   Synology, Fastmail, and any generic WebDAV server. No console paperwork.
4. **Dropbox** (`dropbox`) — App-folder access type, OAuth 2 PKCE via
   `chrome.identity.launchWebAuthFlow`, refresh tokens. File:
   `/settings.json` inside the app folder.
5. **OneDrive** (`onedrive`) — Microsoft Graph App Folder
   (`special/approot:/settings.json`), scopes
   `Files.ReadWrite.AppFolder offline_access openid`, PKCE + refresh tokens.
   Works for personal MSAs and OneDrive for Business (tenant consent
   permitting). Azure app registered in the BoxTechs tenant with MPN
   publisher verification.
6. **Google Drive** (`gdrive`) — `appDataFolder` scope, PKCE via a Web-type
   OAuth client; access-token renewal via silent `prompt=none`
   `launchWebAuthFlow` with interactive fallback (public web clients get no
   refresh token). Ships availability-gated until Google's sensitive-scope
   verification completes.

Plus **Export/Import** (not a provider): options card with "Download
settings" (JSON file of the doc) and "Load settings" (file input; imported
keys get `stamp = now` so an import deliberately wins everywhere).

## OAuth plumbing (shared)

- All flows: `chrome.identity.launchWebAuthFlow` + PKCE; redirect URI
  `https://<extension-id>.chromiumapp.org/<provider>`. Each console registers
  the dev ID now and the Chrome/Edge store IDs once the listings exist.
- Client IDs live in `js/sync/config.js` as placeholders; a provider whose
  ID is unset reports `isAvailable: { ok: false, reason: 'not configured' }`
  and its picker row explains it's coming soon. Console setup walkthroughs in
  `docs/oauth-setup.md` (user-performed).
- Tokens/credentials in `storage.local` (standard extension practice; noted
  in PRIVACY.md).

## UI

The options Sync card becomes a provider picker: radio list (Off / Browser /
Folder / WebDAV / Dropbox / OneDrive / Google Drive) with per-row status
line, Connect/Disconnect, per-row availability notes, Sync now + last-synced
time. Export/Import is its own card. Selector-stability contract continues
(existing e2e selectors untouched).

## Privacy / store impact (ships with the feature)

PRIVACY.md + both listings gain: "TabSetGo makes no external requests unless
you connect a cloud sync provider; then it talks directly to the provider you
chose (your own account) — we run no servers." Host permissions already cover
the API hosts.

## Testing

- **FakeProvider** (`fake`, hidden unless `storage.local.__testFakeProvider`)
  backed by `storage.local.__fakeRemote` — e2e covers migration, LWW merge
  both directions, debounced push, import-wins, without any real OAuth.
- **WebDAV e2e for real:** the test spawns a minimal local HTTP server
  implementing GET/PUT and runs a full roundtrip.
- OAuth providers: code-complete but auth flows are manually smoke-tested per
  browser (Chrome/Edge/Brave/Opera) once console IDs exist — tracked as a
  checklist, never claimed verified before that.
- Existing 16 scenarios run unmodified.

## Versioning / sequencing

Lands on master as **4.1.0**; store upload only after the 4.0.0 listings
clear review. Build order: engine + browser provider + migration → picker UI
+ export/import → folder + WebDAV → OAuth trio (code + setup docs) → privacy/
listing/changelog/zip wrap. Google verification paperwork starts in parallel
and gates only that provider's enablement.

## Out of scope

Any other providers (decided 2026-07-25: the lineup above is final — no Box,
no Gist, no S3, no iCloud). Passphrase encryption of the sync doc (YAGNI).
Firefox. Changes to redirect-path behavior.
