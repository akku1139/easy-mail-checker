# easy-mail-checker

Multi-account Gmail checker browser extension for **Firefox (MV2)** and **Chrome / Chromium (MV3)**.

## Features

- **Multi-account** — add any number of Google accounts, switch from the popup header.
- **Read mail** — full message body rendered in a sandboxed iframe (HTML) or `<pre>` (plain text).
- **Delete mail** — move to Gmail's trash (or archive) from list or reader.
- **Mark read/unread** — per-message, with unread dot and bold styling.
- **Theme switch** — light / dark / follow-system, plus accent color (blue/green/purple).
- **Unread badge** — total unread across all accounts on the toolbar icon.
- **Search & unread-only filter**, ja/en UI language auto-detection.

## Build

```bash
pnpm install
pnpm build   # → dist-mv2/ (Firefox) + dist-mv3/ (Chrome)
pnpm zip     # also produces easy-mail-checker-mv2.zip and -mv3.zip
```

Load unpacked:

- **Chrome**: `chrome://extensions` → Developer mode → "Load unpacked" → `dist-mv3/`
- **Firefox**: `about:debugging#/runtime/this-firefox` → "Load Temporary Add-on…" → any file in `dist-mv2/`

## Sign-in experience

**End users never touch Google Cloud Console.** The extension ships with a
Google OAuth client baked in at build time, so the popup simply shows a
**"Sign in with Google"** button on first run — click it, consent, done.
The same client serves every install because the extension IDs are pinned:

- **Firefox**: fixed `gecko.id` (`easy-mail-checker@example.com`) → the redirect
  URI `https://<id>.extensions.allizom.org/` is identical for all users. AMO-signed
  builds keep this ID; temporary loads get a per-install ID and need their own entry.
- **Chrome**: the manifest's `key` field pins the unpacked/store ID → redirect
  URI `https://<id>.chromiumapp.org/`. Generate a key once:
  `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`,
  build with `EASY_MAIL_EXT_KEY=...`, and register `https://<derived-id>.chromiumapp.org/`.

### Release maintainer: one-time setup

1. [Google Cloud Console](https://console.cloud.google.com/) → create/select a project.
2. Enable the **Gmail API**.
3. *OAuth consent screen*: External (or Internal for your org), add scope
   `https://mail.google.com/` — a **restricted** scope; while unverified, only test users can sign in,
   so publish the app or use Internal distribution.
4. *Credentials → OAuth client ID*: one client with **both** redirect URIs:
   - type *Web application* → `https://easy-mail-checker@example.com... .extensions.allizom.org/`
     (exact value: what `browser.identity.getRedirectURL()` prints in the options page)
   - type *Chrome Extension* → `https://<pinned-id>.chromiumapp.org/`
5. Build the release:

```bash
EASY_MAIL_CLIENT_ID=xxxx.apps.googleusercontent.com \
EASY_MAIL_CLIENT_SECRET=GOCSPX-...      # optional, needed for the Firefox flow without PKCE-only clients
EASY_MAIL_EXT_KEY=<base64 key>          # optional, pins Chrome extension id
pnpm zip
```

Builds without these env vars still compile, but print a loud warning and fall
back to BYO-client mode (users enter their own client ID in the options page).

Per-account client overrides remain available in the options page.

### Firefox note

Firefox's `identity.launchWebAuthFlow` cannot receive loopback redirects, hence
the https `.extensions.allizom.org/` redirect URI above.

## Architecture

```
src/
  shared/       # platform-agnostic core used by both targets
    env.ts      # __TARGET__ define → api (browser|chrome)
    types.ts    # domain + Gmail API shapes
    storage.ts  # accounts/settings in storage.local
    secrets.ts  # refresh tokens under one key for clean sign-out
    auth.ts     # Chrome identity flow / Firefox PKCE+refresh-token flow
    gmail.ts    # Gmail REST API wrapper (list/read/trash/modify)
    theme.ts    # data-theme/data-accent engine
    i18n.ts     # ja/en dictionary
  background/   # polling + badge; one entry shared by both targets
  ui/           # popup (list ⇄ reader slides)
  options/      # settings page
assets/ui.css   # themeable stylesheet
scripts/        # manifest generation, PNG icons, zip packing (node-core only)
```

The same TypeScript compiles to two targets; only the auth adapter differs at runtime
(`browser.*` vs `chrome.identity`), selected by a build-time define. Background logic is
identical for MV2 event page and MV3 service worker.

## License

MIT — see [LICENSE](LICENSE).
