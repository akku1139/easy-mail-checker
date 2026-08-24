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

## OAuth setup (required once)

The extension talks to the Gmail REST API directly, so it needs OAuth credentials.
You can use your own client — nothing is sent anywhere else.

1. [Google Cloud Console](https://console.cloud.google.com/) → create/select a project.
2. Enable the **Gmail API**.
3. *APIs & Services → OAuth consent screen*: Internal or Testing, add scope
   `https://mail.google.com/` (restricted scope — add yourself as a test user while unverified).
4. *Credentials → Create credentials → OAuth client ID*:
   - **Chrome (MV3)**: type *Chrome Extension*, paste your extension ID shown at `chrome://extensions`.
   - **Firefox (MV2)**: type *Web application*,
     redirect URI = `https://<your-extension-id>.extensions.allizom.org/`
     (the exact value is what `browser.identity.getRedirectURL()` returns).
5. Enter the **Client ID** in the extension options page ("OAuth clients" section),
   or bake it in at build time: `EASY_MAIL_CLIENT_ID=xxxxx pnpm build`.

Per-account overrides are supported via the options page.

### Firefox note

Firefox's `identity.launchWebAuthFlow` cannot receive loopback redirects, so the
Web-application redirect URI above is used; it is stored per-account in the options page.

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
