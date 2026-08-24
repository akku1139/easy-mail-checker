/**
 * Generates the RSA key used to pin the Chrome extension ID.
 *
 *   node scripts/gen-ext-key.mjs
 *
 * Output:
 *   - EASY_MAIL_EXT_KEY  → put this base64 string into GitHub repo secrets.
 *     It is the PUBLIC key (SPKI/DER, base64); it ships inside manifest.json.
 *   - the Chrome extension ID derived from it → register the redirect URI
 *     https://<that-id>.chromiumapp.org/ on your Google OAuth client.
 *
 * Keep the printed PRIVATE key somewhere safe (password manager). It is NOT
 * needed to build or load the extension, but it is the only way to recover
 * the same extension ID if the secret is lost, and it lets you produce
 * packed .crx files under the same identity.
 */
import { generateKeyPairSync, createHash } from "node:crypto";

const { publicKey, privateKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicKeyEncoding: { type: "spki", format: "der" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
});

const spkiBase64 = Buffer.from(publicKey).toString("base64");

// Chromium: id = first 16 bytes of SHA-256 over SPKI DER,
// each hex digit (0-15) mapped to 'a'-'p' → 32-letter id.
const hash = createHash("sha256").update(Buffer.from(publicKey)).digest("hex");
const extId = hash
  .slice(0, 32)
  .split("")
  .map((c) => String.fromCharCode("a".charCodeAt(0) + parseInt(c, 16)))
  .join("");

console.log("─".repeat(64));
console.log("EASY_MAIL_EXT_KEY (GitHub secret — public half, safe to embed):");
console.log(spkiBase64);
console.log("─".repeat(64));
console.log(`Derived Chrome extension ID: ${extId}`);
console.log(`OAuth redirect URI for Chrome:\n  https://${extId}.chromiumapp.org/`);
console.log("─".repeat(64));
console.log("PRIVATE KEY (store securely, never commit, never put in secrets");
console.log("that end up in builds — only for recovery/.crx packing):");
console.log(privateKey.toString().trim());
