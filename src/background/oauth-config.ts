/**
 * OAuth client resolution.
 *
 * For end users to "just sign in", the extension ships with a Google OAuth
 * client baked in at build time. The release engineer sets:
 *
 *   EASY_MAIL_CLIENT_ID=xxxx.apps.googleusercontent.com pnpm build
 *   (optionally EASY_MAIL_CLIENT_SECRET for the Firefox flow)
 *
 * End users never visit Google Cloud Console. Users CAN still override the
 * client per-account in the options page (kept for BYO-client users).
 */
import { loadSettings } from "../shared/storage";
import { IS_FIREFOX } from "../shared/env";

export const DEFAULT_CLIENT_ID: string = import.meta.env?.EASY_MAIL_CLIENT_ID ?? "";
export const DEFAULT_CLIENT_SECRET: string = import.meta.env?.EASY_MAIL_CLIENT_SECRET ?? "";

/** True when the shipped build has a usable built-in client. */
export function hasBuiltinClient(): boolean {
  return DEFAULT_CLIENT_ID.length > 0;
}

/**
 * Firefox redirect: browser.identity.getRedirectURL() derives from the
 * add-on's signed ID, so a fixed gecko id (see scripts/manifest.mjs) keeps it
 * stable across installs — one redirect URI registration serves all users.
 */
export async function firefoxRedirectUrl(): Promise<string> {
  // Google rejects the *.extensions.allizom.org dummy domain (it cannot be
  // domain-verified). MDN's documented alternative for Firefox >= 86 is a
  // loopback redirect: http://127.0.0.1/mozoauth2/<subdomain of getRedirectURL()>
  const native = IS_FIREFOX ? (globalThis as any).browser?.identity?.getRedirectURL?.() : undefined;
  const subdomain =
    typeof native === "string" && native
      ? (native.replace(/^https?:\/\//, "").split(".")[0] ?? "")
      : "easy-mail-checker_example_com"; // makeWidgetId("easy-mail-checker@example.com")
  return `http://127.0.0.1/mozoauth2/${subdomain}`;
}

/** Resolve which OAuth client an account uses (per-account override or default). */
export interface ResolvedClient {
  clientId: string;
  clientSecret?: string;
  redirectUrl?: string;
}

export async function clientFor(accountId?: string): Promise<ResolvedClient> {
  const settings = await loadSettings();
  const custom = settings.clients[accountId ?? "__default__"];
  return {
    clientId: custom?.clientId || DEFAULT_CLIENT_ID,
    clientSecret: custom?.clientSecret || DEFAULT_CLIENT_SECRET,
    redirectUrl: IS_FIREFOX ? custom?.redirectUrl : undefined,
  };
}
