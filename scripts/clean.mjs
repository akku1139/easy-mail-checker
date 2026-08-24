import { rmSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const root = new URL("..", import.meta.url).pathname;
for (const d of ["dist-mv2", "dist-mv3"]) {
  const p = resolve(root, d);
  if (existsSync(p)) {
    rmSync(p, { recursive: true, force: true });
    console.log("removed", d);
  }
}
for (const z of ["easy-mail-checker-mv2.zip", "easy-mail-checker-mv3.zip"]) {
  const p = resolve(root, z);
  if (existsSync(p)) {
    rmSync(p, { force: true });
    console.log("removed", z);
  }
}
