# TabSetGo pre-publish polish: theme system, options refresh, image modernization

Approved in-session 2026-07-25 (design presented, user replied "engage").

## Goals

1. **Theme system** on all three user-facing pages (new-tab Apps page `main.html`, `options.html`, `welcome.html`): follows the OS by default, with a user toggle for System / Light / Dark.
2. **Options page modern refresh**: keep the Angular structure and tabs; restyle the URL tab into labeled setting cards with plain-language helper text under every control; modern spacing/typography; quick-saves as a chip grid; Permissions tab gets the card treatment.
3. **Image modernization**: delete orphaned legacy images; rebuild still-used assets brand-consistent and theme-aware; regenerate the stale welcome-intro screenshots; simplify `images/README.md` licensing.
4. **Publish wrap**: `PRIVACY.md`, store screenshots in both themes, listing doc update, changelog fold into the unreleased 4.0.0, submission zip rebuild.

## Theme architecture

- `css/theme.css` (new, loaded first on all three pages) defines ~16 CSS custom
  properties on `:root` with light values; a `:root[data-theme="dark"]` block
  and an identical block inside `@media (prefers-color-scheme: dark)` guarded
  as `:root:not([data-theme="light"])` supply dark tokens. Explicit choice
  beats OS; absence of the attribute means System.
- `js/theme.js` (new, framework-free, first script in each page `<head>`):
  reads a `localStorage` mirror synchronously and stamps
  `document.documentElement.dataset.theme` pre-paint (no white flash on new
  tabs), then reconciles from `chrome.storage.local` (source of truth, key
  `theme`: `"system" | "light" | "dark"`, default `"system"`) and subscribes
  to `chrome.storage.onChanged` for live updates across open pages.
- Persistence follows the project storage architecture: always
  `storage.local`; dual-written to `storage.sync` when the sync option is on
  (the existing strict opt-in background mirror then roams it).
- Toggle UI: an "Appearance" setting card in the options URL tab with a
  three-state radio group (System / Light / Dark), `ng-change` →
  `changeTheme()`.
- Existing sheets (`common.css`, `options.css`, `welcome.css`) are refactored
  to consume the tokens; no hardcoded colors remain in themed surfaces.

## Options refresh

- URL tab becomes five cards: **New tab opens** (URL input + Save/Cancel/get-synced buttons; blank = built-in Apps page; `file:///` supported), **Address bar behavior** (always-update-tab explained in plain words), **Sync across devices** (opt-in + Chrome-roams / Edge-Brave-don't caveat), **Appearance** (theme radios), **One-click save** (Popular/Chrome pages as chips).
- Every control gets a `.hint` helper line. Permissions tab content unchanged, wrapped in cards.
- **Selector stability contract:** `input[name="url"]`, `button[title="Save"]`, `button[title="Cancel"]`, `button[title="One-time get Synced URL"]`, `input[ng-model="sync"]`, `input[ng-model="alwaysTabUpdate"]` must keep working — the existing 10 e2e scenarios run unmodified.

## Images

Audit (2026-07-25): `google_32.png`, `twitter_32.png`, `apps.png`, `sample.png` have zero references → delete. Still used: `left.png`/`right.png` (welcome nav), `github_32.png` via `.github-icon` (welcome ×2, options ×1), `document-new.svg` (`common.css:144`), `.settings-link` + `images/screenshots/*` (welcome intro previews), `icon36.png` (`.welcome-icon`).

- GitHub mark: replace PNG with the official Primer Octicons `mark-github` SVG (MIT), rendered via a `::before` element using `mask` + `background-color: var(--text)` so one asset works in both themes.
- Welcome nav arrows: hand-authored chevron SVGs via the same mask technique (`var(--text-muted)`), replacing the CC-BY `left.png`/`right.png`.
- `document-new.svg`: replaced with a minimal neutral-palette SVG that reads on both themes, same filename.
- Welcome intro screenshots: regenerated from the refreshed, themed UI via a capture script; filenames renamed `tabsetgo-*` with `welcome.css` URLs updated. `Chrome-Settings.png` replaced if capturable, otherwise dropped with the FAQ styling simplified.
- `images/README.md`: CC-BY and intridea notes removed once those assets are gone; everything remaining is project-original MIT.

## Verification

Three new e2e scenarios (S6a–c) added to `tests/e2e/redirect.spec.mjs` using Playwright `emulateMedia({ colorScheme })` and a computed-background luminance assertion: (a) System mode follows emulated OS dark and light; (b) an explicit choice beats the emulated OS and persists across reload; (c) dark tokens apply on all three pages. Existing 10 scenarios must stay green unmodified.

## Out of scope

Ground-up options redesign; theming `example.html` or repo docs; manifest/permission changes; store account actions (user-side).
