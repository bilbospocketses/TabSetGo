# OAuth app setup for the cloud sync providers

The Dropbox, OneDrive, and Google Drive providers each need a one-time app
registration in that vendor's console. The resulting **client IDs are public
identifiers** (PKCE public clients, no secrets) and go into
`js/sync/config.js`. Until an ID is filled in, that provider's picker row
shows "needs setup" and stays disabled.

## Redirect URIs (all three consoles)

`chrome.identity.launchWebAuthFlow` redirects to
`https://<EXTENSION_ID>.chromiumapp.org/<provider>`. Register one URI per
extension ID you run:

| Build | Extension ID | Example redirect (Dropbox) |
|---|---|---|
| Chrome Web Store | from the live listing URL | `https://<chrome-id>.chromiumapp.org/dropbox` |
| Edge Add-ons | from the live listing | `https://<edge-id>.chromiumapp.org/dropbox` |
| Unpacked dev | `chrome://extensions` with dev mode on | `https://<dev-id>.chromiumapp.org/dropbox` |

Provider path suffixes: `/dropbox`, `/onedrive`, `/gdrive`.

Note: store IDs only exist after first publish — register the dev ID now, add
the store IDs when the listings are live.

## Dropbox (fastest)

1. https://www.dropbox.com/developers/apps → **Create app** → *Scoped
   access* → **App folder** (the app can only see its own folder) → name it
   (e.g. `TabSetGo`).
2. Permissions tab: enable `files.content.write` and `files.content.read` →
   Submit.
3. Settings tab: add the redirect URIs; copy the **App key** →
   `dropboxClientId`.
4. Apps start in development mode (up to 500 users); apply for production
   from the console when ready — lightweight review.

## OneDrive (Azure app registration, BoxTechs tenant)

1. https://portal.azure.com → Microsoft Entra ID → **App registrations** →
   New registration. Name `TabSetGo`; supported account types: **Accounts in
   any organizational directory and personal Microsoft accounts**.
2. Platform: **Single-page application** → add the redirect URIs.
3. API permissions: Microsoft Graph → Delegated → `Files.ReadWrite.AppFolder`
   + `offline_access` (no admin consent needed for these).
4. Copy the **Application (client) ID** → `onedriveClientId`.
5. Recommended: complete **publisher verification** (Partner Center MPN ID)
   so consent screens don't show "unverified".

## Google Drive (has a verification wait — start early)

1. https://console.cloud.google.com → new project `TabSetGo`.
2. **OAuth consent screen**: External; app name, support email, developer
   contact; authorized domain `github.io`/homepage = the repo URL; privacy
   policy URL = the repo `PRIVACY.md`.
3. Add scope `https://www.googleapis.com/auth/drive.appdata` (sensitive).
4. **Credentials** → Create credentials → OAuth client ID → **Web
   application** → add the redirect URIs. Copy the client ID →
   `gdriveClientId`.
5. Enable the **Google Drive API** for the project (APIs & Services →
   Library).
6. While the consent screen is in *Testing*, add your own Google account as a
   test user — the provider works for testers immediately.
7. Submit for **verification** (sensitive scope): questionnaire + privacy
   policy; expect days-to-weeks. The provider ships disabled for everyone
   except testers until this clears.

Note: the Drive provider uses the implicit grant via `launchWebAuthFlow`
(standard for extensions — Google web clients get no refresh token without a
secret) and renews access tokens silently with `prompt=none`.

## Manual smoke checklist (per browser: Chrome, Edge, Brave, Opera)

For each configured provider:

1. Options → Sync → select the provider → **Connect account…** → complete the
   vendor's consent screen → status shows connected.
2. Change the redirect URL → wait ~3s → confirm the file changed on the
   provider (Dropbox app folder / OneDrive `Apps/TabSetGo` / Drive app data
   via a second machine).
3. Second browser/machine: connect the same account → **Sync now** → settings
   arrive.
4. Disconnect → confirm tokens cleared (status shows not connected).

These flows are NOT covered by the automated suite (real accounts required);
do not claim them verified until this checklist has been run.
