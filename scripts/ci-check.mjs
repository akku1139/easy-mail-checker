/**
 * CI verification: build artifacts are complete and internally consistent.
 * Exits non-zero on the first problem found.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = new URL("..", import.meta.url).pathname;
let failed = false;
function check(ok, label) {
  console.log(`${ok ? "OK " : "FAIL"}  ${label}`);
  if (!ok) failed = true;
}

const pkg = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));

for (const target of ["mv2", "mv3"]) {
  const dist = resolve(root, `dist-${target}`);
  const manifest = JSON.parse(readFileSync(resolve(dist, "manifest.json"), "utf8"));

  check(manifest.version === pkg.version, `${target}: manifest version matches package.json (${pkg.version})`);

  // every file referenced by the manifest must exist in the dist
  const refs = [
    ...Object.values(manifest.icons ?? {}),
    manifest.browser_action?.default_popup,
    manifest.action?.default_popup,
    manifest.options_ui?.page,
    manifest.options_page,
    ...(manifest.background?.scripts ?? []),
    manifest.background?.service_worker,
  ].filter(Boolean);
  for (const ref of refs) {
    check(existsSync(resolve(dist, ref)), `${target}: ${ref} exists`);
  }

  // popup/options must reference the bundled scripts via module scripts
  for (const html of ["popup.html", "options.html"]) {
    const src = readFileSync(resolve(dist, html), "utf8");
    check(src.includes('type="module"'), `${target}: ${html} uses type=module`);
  }
}

// zips exist when present in the workspace (release builds run pack.mjs first;
// plain verify builds legitimately have none, so absence is not an error)
const zips = [`easy-mail-checker-mv2.zip`, `easy-mail-checker-mv3.zip`];
if (zips.some((z) => existsSync(resolve(root, z)))) {
  for (const zipName of zips) {
    check(existsSync(resolve(root, zipName)), `${zipName} built`);
  }
}

// no accidental secrets in the shipped bundles
const { execFileSync } = await import("node:child_process");
function grep(dir, pattern) {
  try {
    // -l lists files with matches; exit code 1 = no match (good)
    execFileSync("grep", ["-rIl", pattern, dir], { stdio: "pipe" });
    return [dir];
  } catch {
    return [];
  }
}
const hits = [...grep(resolve(root, "dist-mv2"), "GOCSPX-"), ...grep(resolve(root, "dist-mv3"), "GOCSPX-")];
check(hits.length === 0, "no client secrets leaked into bundles");

if (failed) process.exit(1);
console.log("\nAll CI checks passed.");

