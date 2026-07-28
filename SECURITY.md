# Security Policy

## Reporting a Vulnerability

**Please do not report security vulnerabilities through public GitHub issues.**

Report security issues privately through GitHub's built-in security advisory flow:

**[Report a vulnerability](https://github.com/bilbospocketses/TabSetGo/security/advisories/new)**

This opens a private channel between you and the maintainer — no public disclosure until a fix is ready.

## What to Include

When reporting, please provide:

- A clear description of the vulnerability and its impact
- Steps to reproduce (proof-of-concept page, settings payload, or network conditions)
- The affected version (extension version from `chrome://extensions` or the manifest) and browser
- Any mitigations you're aware of

## Response Expectations

- **Acknowledgement:** within **72 hours** of receipt
- **Triage and initial assessment:** within one week
- **Fix and disclosure timeline:** discussed with the reporter on a per-issue basis, depending on severity and complexity

## Supported Versions

Security fixes target the latest commit on `master` and ship in the next store release. Only TabSetGo **4.x** is supported. The pre-fork "New Tab Redirect" extension (3.1.x and earlier) is a separate, unmaintained project — issues in it cannot be fixed here.

## Scope

In scope: everything the extension ships — the MV3 service worker, the new-tab / options / welcome pages, storage handling (`storage.local` / `storage.sync` semantics and the self-heal path), the sync engine and every provider (browser account, synced folder via the File System Access API, the WebDAV client, and the Dropbox / OneDrive / Google Drive OAuth PKCE flows, including how tokens are stored), and the vendored libraries as bundled (AngularJS).

Of particular interest: anything that lets a visited web page read or alter extension settings, exfiltrate sync credentials/tokens, or redirect new tabs somewhere the user didn't choose.

Out of scope:

- Issues requiring an already-compromised browser profile or machine, or a malicious co-installed extension with sufficient permissions.
- Vulnerabilities in the browsers themselves or in the sync vendors' services (report to Google/Microsoft/Dropbox/your WebDAV server vendor).
- Self-XSS requiring the victim to paste attacker-controlled code into devtools.
- The user pointing their own new tab at a hostile URL — that is the product working as configured.

Thanks for helping keep the project safe.
