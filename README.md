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
  URI is the loopback form
  `http://127.0.0.1/mozoauth2/bf61fff5f07affccd95ddad06e4ed35d7a3e57c4`
  (SHA-1 hex of the add-on ID), identical for all users (Firefox ≥ 86; Google
  rejects the `*.extensions.allizom.org` dummy domain because it cannot be
  ownership-verified).
- **Chrome**: the manifest's `key` field pins the extension ID → redirect URI
  `https://<id>.chromiumapp.org/`. Generate the key once (see next section) and
  register the derived redirect URI on your Google OAuth client.

### Release maintainer: one-time setup

#### 1. Generate the Chrome extension key (local, one command)

```bash
node scripts/gen-ext-key.mjs
```

This prints:

- `EASY_MAIL_EXT_KEY` — the **public** key (base64 SPKI). This is what goes into
  GitHub secrets and then into manifest.json; it is safe to embed in builds.
- The derived **Chrome extension ID** and its OAuth redirect URI — you will paste
  this into Google Cloud Console.
- A private key — store it in your password manager, never commit it. Building,
  loading, and CI do not need it; it only lets you recover the same extension ID
  if the secret is lost.

Re-running the script creates a NEW identity. Generate once and reuse the value.

#### 2. Create the Google OAuth client

1. [Google Cloud Console](https://console.cloud.google.com/) → create/select a project.
2. Enable the **Gmail API**.
3. *OAuth consent screen*: External (or Internal for your org), add scope
   `https://mail.google.com/` — a **restricted** scope; while unverified, only test users can sign
   in, so publish the app or use Internal distribution.
4. *Credentials → OAuth client ID*, type *Web application* with **both** redirect URIs:
- Firefox: `http://127.0.0.1/mozoauth2/bf61fff5f07affccd95ddad06e4ed35d7a3e57c4`
  (exact value also shown in the extension options page)
   - Chrome: `https://<extension-id>.chromiumapp.org/` (from step 1)

You get a **Client ID** (`….apps.googleusercontent.com`) and a **Client secret**
(`GOCSPX-…`). Both are needed.

#### 3. Put the values into GitHub repository secrets

Repo → Settings → Secrets and variables → Actions → *New repository secret*:

| Secret | Value |
| --- | --- |
| `EASY_MAIL_CLIENT_ID` | client ID from step 2 |
| `EASY_MAIL_CLIENT_SECRET` | client secret from step 2 |
| `EASY_MAIL_EXT_KEY` | public-key string printed by step 1 |

Optional: `AMO_JWT_ISSUER` / `AMO_JWT_SECRET` from [addons.mozilla.org](https://addons.mozilla.org/developers/)
(Settings → API keys) if you want the release CI to produce an AMO-signed `.xpi`.
Without them the release ships an unsigned MV2 zip instead.

That's it — releases are now fully automated (see "Releasing" below).

#### Local builds without secrets

```bash
pnpm zip   # or: EASY_MAIL_* set for a real sign-in build
```

Builds without these env vars still compile, but print a loud warning and fall
back to BYO-client mode (users enter their own client ID in the options page).

Per-account client overrides remain available in the options page.

### Firefox note

Since Firefox 86, `identity.launchWebAuthFlow` accepts loopback redirects of the
form `http://127.0.0.1/mozoauth2/<sha1-hex-of-add-on-id>` (RFC 8252 §7.3) — this
is what makes the Google-compatible redirect above possible. The hash is exactly
what Firefox compares against; compute it with
`echo -n "<add-on id>" | sha1sum` if the ID ever changes.

#### Installing the unsigned MV2 zip in Firefox

Firefox only loads unsigned add-ons permanently when signature enforcement is
off. Pick one:

- **Recommended — get it signed**: set the `AMO_JWT_ISSUER` / `AMO_JWT_SECRET`
  secrets (free API keys from [addons.mozilla.org/developers](https://addons.mozilla.org/developers/addon/api/key/))
  and cut a new release; the CI then ships an installable `.xpi`. Self-distributed
  signed builds stay installable for their update-URL users without listing publicly.
- **Try it out temporarily** (no settings change): `about:debugging#/runtime/this-firefox`
  → *Load Temporary Add-on…* → pick any file inside the unzipped folder.
  Temporary loads are removed when Firefox closes and get a per-install extension
  ID (see the OAuth note above).
- **Developer/Nightly/Esr-with-pref**: on Firefox Developer Edition or Nightly
  set `xpinstall.signatures.required = false` in `about:config`, then
  about:addons → gear → *Install Add-on From File…* works with the raw zip renamed to `.xpi`.
  (Release/beta builds do not honor this pref.)

## Releasing

Everything is automated from a tag; the only developer action is:

```bash
pnpm version patch        # or minor / major — bumps package.json, tags vX.Y.Z
git push --follow-tags
```

The [release workflow](.github/workflows/release.yml) then:

1. verifies the tag matches `package.json` (they cannot drift),
2. builds both targets with the baked-in OAuth client and pinned extension key,
3. runs artifact consistency checks (`scripts/ci-check.mjs`),
4. optionally signs the Firefox add-on via AMO (if AMO secrets are set),
5. publishes a GitHub Release with `easy-mail-checker-mv3.zip`,
   `easy-mail-checker-mv2.zip` and — when AMO secrets exist — a signed `.xpi`.

Pushes to `main` and PRs run a lighter [verify workflow](.github/workflows/verify.yml)
(typecheck + build + checks) without publishing anything.

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
