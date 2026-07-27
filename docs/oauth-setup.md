# OAuth console setup for the cloud sync providers

The Dropbox, OneDrive, and Google Drive sync providers each need a one-time
app registration in that vendor's developer console. Each registration
produces a **client ID** — a public identifier (these are PKCE public
clients; there are no secrets anywhere in this setup) — which goes into
[`js/sync/config.js`](../js/sync/config.js). Until an ID is filled in, that
provider's row in the sync picker shows "needs setup" and stays disabled.

**Recommended order: start Google first.** Its sensitive-scope verification
takes days to weeks (although test-user mode works immediately), while
Dropbox takes minutes and Azure is quick.

**Copy/paste convention used in this document:** every value you need to
paste into a console form sits in a fenced block like this:

```text
Example — copy exactly what is inside the box, nothing else.
```

On GitHub, hover over a block and click the copy icon in its top-right corner
to grab the exact text with no markdown markers.

## Step 1 — Collect your extension ID(s)

The OAuth redirect URIs embed the extension ID, and each install channel has
a different one:

| Build | Where to find the ID |
|---|---|
| Unpacked dev build | Open `chrome://extensions`, switch on **Developer mode** (toggle, top right), click **Load unpacked**, and select the repo folder (the one containing `manifest.json`). The ID appears on the extension's card. |
| Chrome Web Store | The 32-character tail of the live listing URL. Exists only **after first publish**. |
| Edge Add-ons | The trailing segment of the live listing URL. Exists only **after first publish**. |

Since store IDs don't exist until the listings are live: **register the dev
ID now, then come back and add the store IDs after first publish.**

## Step 2 — Build your redirect URI list

The extension's OAuth flow (`chrome.identity.launchWebAuthFlow`) redirects
to this pattern:

```text
https://<EXTENSION_ID>.chromiumapp.org/<provider>
```

The `<provider>` path suffix depends on which console you are in:

| Console | Suffix |
|---|---|
| Dropbox | `/dropbox` |
| Azure (OneDrive) | `/onedrive` |
| Google (Drive) | `/gdrive` |

In **each** console, register one URI per extension ID you have, using that
console's suffix. For example, with a dev ID of
`abcdefghijklmnopabcdefghijklmnop`, the Dropbox console gets:

```text
https://abcdefghijklmnopabcdefghijklmnop.chromiumapp.org/dropbox
```

…and once the Chrome and Edge store IDs exist, two more URIs of the same
shape. Three extension IDs → three URIs in each of the three consoles.

## Dropbox — fastest, doable in one sitting

1. Go to https://www.dropbox.com/developers/apps and sign in with the Dropbox
   account that should own the app.
2. Click **Create app** (top right).
3. "Choose an API": select **Scoped access**.
4. "Choose the type of access": select **App folder** — the app can only
   ever see its own dedicated folder, nothing else in the account.
5. Name the app (e.g. `TabSetGo` — app names are globally unique, so pick a
   variant if it's taken) and click **Create app**.
6. Open the **Permissions** tab: tick both scopes below, then click
   **Submit** in the banner at the bottom.

```text
files.content.write
```

```text
files.content.read
```

7. Open the **Settings** tab. Under **OAuth 2 → Redirect URIs**, paste each
   redirect URI from Step 2 and click **Add** after each one.
8. Still on Settings: copy the **App key** (NOT the App secret — the secret
   is never used). That value is your `dropboxClientId`.
9. Production access: new apps start in **development mode** (up to 500
   users). When ready for the public, click **Apply for production** in the
   console — it's a lightweight review.

## OneDrive — Azure app registration (BoxTechs tenant)

1. Go to https://portal.azure.com and sign in.
2. In the search bar at the top, type **Microsoft Entra ID** and open it.
3. In the left menu, click **App registrations**, then **+ New registration**.
4. Name: `TabSetGo`.
5. Supported account types: select **Accounts in any organizational
   directory (Any Microsoft Entra ID tenant - Multitenant) and personal
   Microsoft accounts** — the broadest option. Personal MSAs must be
   included, or consumer OneDrive sign-ins will fail.
6. Under Redirect URI (still on the registration form): set the platform
   dropdown to **Single-page application (SPA)** and paste the first URI
   from Step 2. Click **Register**.
7. Add the remaining URIs: left menu **Authentication** → under
   *Single-page application*, click **Add URI**, paste, **Save**.
8. Left menu **API permissions** → **+ Add a permission** → **Microsoft
   Graph** → **Delegated permissions**. Search for and tick each of these
   (the second lives under *OpenId permissions*), then click **Add
   permissions**. Neither needs admin consent.

```text
Files.ReadWrite.AppFolder
```

```text
offline_access
```

9. Go to the **Overview** blade and copy the **Application (client) ID**.
   That value is your `onedriveClientId`.
10. Recommended: complete **publisher verification** (associate the Partner
    Center MPN ID) so consent screens don't show "unverified".

## Google Drive — START THIS FIRST (verification wait)

1. Go to https://console.cloud.google.com and sign in.
2. Open the project picker (top bar) → **New project** → name it `TabSetGo`
   → **Create** → make sure the new project is selected.
3. Enable the API: ☰ menu → **APIs & Services** → **Library** → search for
   **Google Drive API** → open it → **Enable**.
4. Configure the consent screen: **APIs & Services** → **OAuth consent
   screen** (newer consoles label this area **Google Auth Platform**):
   - User type: **External**.
   - App name `TabSetGo`, your support email, your developer contact email.
   - Authorized domain: `github.io`. Homepage — the repo URL:

```text
https://github.com/bilbospocketses/TabSetGo
```

   - Privacy policy URL:

```text
https://github.com/bilbospocketses/TabSetGo/blob/master/PRIVACY.md
```

5. Scopes: click **Add or remove scopes**, filter for *Drive*, and tick the
   scope below (Google lists it as **sensitive**). Then **Update** / save.

```text
https://www.googleapis.com/auth/drive.appdata
```

6. Test users: while the publishing status is **Testing**, click **+ Add
   users** and add your own Google account — the provider works immediately
   for listed testers.
7. Create the client ID: **APIs & Services** → **Credentials** → **+ Create
   credentials** → **OAuth client ID** → application type **Web
   application** → name it → under **Authorized redirect URIs**, add each
   URI from Step 2 → **Create**. Copy the client ID (ignore any client
   secret — it is not used). That value is your `gdriveClientId`.
8. Submit for **verification** (required by the sensitive scope):
   questionnaire + privacy policy review. Expect **days to weeks**; until it
   clears, everyone except your listed test users is locked out of the
   Drive provider.

Technical note: the Drive provider uses the implicit grant via
`launchWebAuthFlow` (standard for extensions — Google web clients get no
refresh token without a secret) and renews access tokens silently with
`prompt=none`.

## Step 3 — Fill in js/sync/config.js

1. Open [`js/sync/config.js`](../js/sync/config.js).
2. Paste each ID between its quotes:

```js
NS.config = {
    'dropboxClientId': 'PASTE-DROPBOX-APP-KEY-HERE',
    'onedriveClientId': 'PASTE-AZURE-APPLICATION-CLIENT-ID-HERE',
    'gdriveClientId': 'PASTE-GOOGLE-OAUTH-CLIENT-ID-HERE'
};
```

3. This file is safe to commit — client IDs are public identifiers, not
   secrets.
4. Reload the unpacked extension (`chrome://extensions` → the ↻ button on
   the card) to pick up the change. For store builds, the IDs must be in
   place **before** running `pwsh scripts/package.ps1`.

## Manual smoke checklist — per browser (Chrome, Edge, Brave, Opera)

For **each configured cloud provider**:

1. Options → Sync → select the provider → **Connect account…** → complete
   the vendor's consent screen → the status line shows connected.
2. Change the redirect URL → wait ~3 seconds → confirm the settings file
   changed on the provider's side (Dropbox app folder / OneDrive
   `Apps/TabSetGo` / Drive app data, checked via a second machine).
3. On a second browser or machine: connect the same account → **Sync now**
   → the settings arrive.
4. Disconnect → confirm tokens are cleared (status shows not connected).

Also cover in the same pass:

- **Synced-folder provider:** pick a folder and confirm the settings file
  appears in it. Then fully restart the browser and change a setting — this
  confirms the stored folder handle is still usable from the background
  service worker (feature-detected in code, but unverified on real
  Chrome/Edge/Opera; the code notes the fallback design if it fails).
- **WebDAV provider:** connect to the real server URL and credentials,
  change a setting, verify the file changed on the server, and pull it from
  a second machine.

These flows are NOT covered by the automated suite (real accounts required);
do not claim them verified until this checklist has been run.
