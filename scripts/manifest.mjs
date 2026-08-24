/**
 * Emits dist-mv2/manifest.json (Firefox MV2) and dist-mv3/manifest.json
 * (Chrome MV3) from one source of truth.
 */
import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = new URL("..", import.meta.url).pathname;

/** Single source of truth for the extension version: package.json. */
const pkg = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
const version = pkg.version;
if (!/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(version)) {
  throw new Error(`Invalid semver in package.json: ${version}`);
}

const common = {
  name: "easy-mail-checker",
  description: "Multi-account Gmail checker: read, mark read/unread and trash mail across accounts.",
  homepage_url: "https://github.com/akku1139/easy-mail-checker",
};

/**
 * Fixed extension IDs so ONE Google OAuth client serves every install:
 *  - Chrome: `key` field pins the extension ID. It is the RSA PUBLIC key
 *    (SPKI/DER, base64) — generate with `node scripts/gen-ext-key.mjs`,
 *    then set the redirect URI https://<derived-id>.chromiumapp.org/ on the
 *    Google OAuth client.
 *  - Firefox: gecko.id is already fixed (see mv2 below).
 * Supply via EASY_MAIL_EXT_KEY at build time (CI reads it from repo secrets).
 */
const EXTENSION_KEY = process.env.EASY_MAIL_EXT_KEY ?? "";

function chromeKeyField() {
  return EXTENSION_KEY ? { key: EXTENSION_KEY } : {};
}

const icons = {
  "16": "icons/16.png",
  "32": "icons/32.png",
  "48": "icons/48.png",
  "128": "icons/128.png",
};

const mv2 = {
  manifest_version: 2,
  ...common,
  version,
  icons,
  permissions: [
    "storage",
    "identity",
    "alarms",
    "https://mail.google.com/",
    "https://gmail.googleapis.com/",
    "https://accounts.google.com/",
    "https://oauth2.googleapis.com/",
    "https://www.googleapis.com/",
  ],
  browser_action: { default_title: "easy-mail-checker", default_popup: "popup.html", default_icon: icons },
  background: { scripts: ["background.js"], persistent: false },
  options_ui: { page: "options.html", open_in_tab: true },
  browser_specific_settings: {
    gecko: { id: "easy-mail-checker@example.com", strict_min_version: "78.0" },
  },
};

const mv3 = {
  manifest_version: 3,
  ...common,
  ...chromeKeyField(),
  version,
  icons,
  minimum_chrome_version: "96",
  permissions: ["storage", "identity", "alarms"],
  host_permissions: [
    "https://mail.google.com/",
    "https://gmail.googleapis.com/",
    "https://accounts.google.com/",
    "https://oauth2.googleapis.com/",
    "https://www.googleapis.com/",
  ],
  action: { default_title: "easy-mail-checker", default_popup: "popup.html", default_icon: icons },
  background: { service_worker: "background.js", type: "module" },
  options_page: "options.html",
};

mkdirSync(resolve(root, "dist-mv2"), { recursive: true });
mkdirSync(resolve(root, "dist-mv3"), { recursive: true });

writeFileSync(resolve(root, "dist-mv2/manifest.json"), JSON.stringify(mv2, null, 2) + "\n");
writeFileSync(resolve(root, "dist-mv3/manifest.json"), JSON.stringify(mv3, null, 2) + "\n");

console.log("manifests written: dist-mv2/manifest.json, dist-mv3/manifest.json");

// Release check: a build without a built-in OAuth client still works, but
// users would have to supply their own client ID — warn loudly.
if (!process.env.EASY_MAIL_CLIENT_ID) {
  console.warn(
    "\n[easy-mail-checker] WARNING: EASY_MAIL_CLIENT_ID is not set.\n" +
      "  This build has NO built-in Google sign-in; users must enter their own\n" +
      "  OAuth client ID in the options page. For one-click sign-in builds:\n" +
      "    EASY_MAIL_CLIENT_ID=xxxx.apps.googleusercontent.com pnpm build\n",
  );
}
