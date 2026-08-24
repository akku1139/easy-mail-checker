import { defineConfig } from "vite";
import { resolve } from "node:path";
import { cpSync } from "node:fs";

/**
 * Four builds share one config, selected via --mode:
 *  - mv3-pages : Chrome MV3 UI bundle (IIFE) + popup.html + options.html + static assets
 *  - mv3-bg    : Chrome MV3 service worker (ESM)
 *  - mv2-pages : Firefox MV2 UI bundle (IIFE) + same HTML + static assets
 *  - mv2-bg    : Firefox MV2 event page (IIFE)
 */
const family = (mode: string) => (mode.startsWith("mv2") ? "mv2" : "mv3");
const isBg = (mode: string) => mode.endsWith("-bg");

export default defineConfig(({ mode }) => {
  const bg = isBg(mode);
  return {
    appType: "custom",
    build: {
      outDir: `dist-${family(mode)}`,
      emptyOutDir: !bg,
      sourcemap: false,
      minify: false,
      modulePreload: false,
      reportCompressedSize: false,
      rollupOptions: {
        input: bg
          ? { background: resolve(import.meta.dirname!, "src/background/index.ts") }
          : {
              ui: resolve(import.meta.dirname!, "src/ui/main.ts"),
              options: resolve(import.meta.dirname!, "src/options/main.ts"),
            },
        output: {
          entryFileNames: "[name].js",
          chunkFileNames: "[name].js",
          assetFileNames: "[name][extname]",
        },
      },
    },
    define: {
      __TARGET__: JSON.stringify(family(mode) === "mv2" ? "firefox" : "chrome"),
      __BUILD__: JSON.stringify(process.env.EASY_MAIL_BUILD ?? "dev"),
      // Baked-in OAuth client (no VITE_ prefix needed). The secret is required
      // because the documented setup uses a "Web application"-type Google
      // client, whose token endpoint demands client_secret.
      "import.meta.env.EASY_MAIL_CLIENT_ID": JSON.stringify(process.env.EASY_MAIL_CLIENT_ID ?? ""),
      "import.meta.env.EASY_MAIL_CLIENT_SECRET": JSON.stringify(process.env.EASY_MAIL_CLIENT_SECRET ?? ""),
    },
    plugins: [
      {
        name: "emc-static",
        // popup.html / options.html reference the bundled scripts verbatim.
        generateBundle() {
          if (bg) return;
          this.emitFile({ type: "asset", fileName: "popup.html", source: htmlSource("ui.js", "") });
          this.emitFile({
            type: "asset",
            fileName: "options.html",
            source: htmlSource("options.js", "options-body"),
          });
        },
        // CSS and icons are plain static files shared by both targets.
        writeBundle() {
          if (bg) return;
          cpSync(resolve(import.meta.dirname!, "assets"), resolve(import.meta.dirname!, `dist-${family(mode)}`), {
            recursive: true,
          });
        },
      },
    ],
  };
});

function htmlSource(script: string, bodyClass = ""): string {
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<link rel="stylesheet" href="ui.css">
<script type="module" src="${script}"></script>
</head>
<body class="${bodyClass}"></body>
</html>
`;
}
