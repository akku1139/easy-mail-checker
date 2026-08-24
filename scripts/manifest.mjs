/**
 * Emits dist-mv2/manifest.json (Firefox MV2) and dist-mv3/manifest.json
 * (Chrome MV3) from one source of truth.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const version = "0.1.0";

const common = {
  name: "easy-mail-checker",
  description: "Multi-account Gmail checker: read, mark read/unread and trash mail across accounts.",
};

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
