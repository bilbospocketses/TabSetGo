# TabSetGo Privacy Policy

TabSetGo does not collect, transmit, sell, or share any data. Period.

- **What's stored:** your redirect URL and preferences (address bar behavior,
  sync opt-in, theme). They live in your browser's extension storage
  (`chrome.storage.local`) on your machine.
- **Sync (optional, off by default):** if you pick a sync provider, the same
  settings are written to the place you chose — your browser account (Browser
  sync), a folder you picked, your own WebDAV server, or your own Dropbox /
  OneDrive / Google Drive app storage. TabSetGo talks directly to the
  provider you selected using your own account; we run no servers and see
  nothing. Sign-in tokens for cloud providers are stored in your browser's
  extension storage on your machine.
- **Network:** with sync off (the default), the extension makes no external
  requests. With a cloud provider connected, requests go only to that
  provider's API. No analytics, telemetry, ads, or remote code, ever.
- **Permissions:** used solely to perform the redirect and render the optional
  built-in Apps page (favicons, top sites, bookmarks bar) — each optional
  permission is off until you enable it in options and is explained there.

Questions or concerns: open an issue at
https://github.com/bilbospocketses/TabSetGo/issues

_Last updated: 2026-07-25 (v4.1.0: provider-based sync)_
