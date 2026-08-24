import { IS_FIREFOX } from "./env";
import type { AccountConfig, AccountSecret, AccountState } from "./types";
import {
  dropCachedState,
  getCachedState,
  loadAccounts,
} from "./storage";
import { loadSecret, persistSecret, removeSecret, saveSecret } from "./secrets";
import { saveAccounts, setCachedState } from "./storage";
import { clientFor, firefoxRedirectUrl } from "../background/oauth-config";
import { t } from "./i18n";

const OAUTH_AUTH = "https://accounts.google.com/o/oauth2/v2/auth";
const OAUTH_TOKEN = "https://oauth2.googleapis.com/token";
const SCOPES = ["https://mail.google.com/", "https://www.googleapis.com/auth/userinfo.email"];

function randomState(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

async function base64url(input: ArrayBuffer): Promise<string> {
  const bytes = new Uint8Array(input);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** PKCE code verifier for the Firefox flow (Chrome's identity API handles its own dance). */
async function makePkce(): Promise<{ verifier: string; challenge: string }> {
  const raw = crypto.getRandomValues(new Uint8Array(32));
  const verifier = await base64url(raw.buffer);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return { verifier, challenge: await base64url(digest) };
}

function extractEmailFromIdToken(idToken?: string): string | undefined {
  if (!idToken) return;
  const part = idToken.split(".")[1];
  if (!part) return;
  try {
    const json = atob(part.replace(/-/g, "+").replace(/_/g, "/"));
    return (JSON.parse(json) as any).email as string | undefined;
  } catch {
    return;
  }
}

export async function startInteractiveAuth(hint?: string): Promise<AccountConfig> {
  const client = await clientFor("__default__");
  if (!client.clientId) {
    throw new Error(t("noBuiltinBuild"));
  }

  const result = IS_FIREFOX
    ? await firefoxFlow({
        clientId: client.clientId,
        clientSecret: client.clientSecret,
        redirectUrl: client.redirectUrl ?? (await firefoxRedirectUrl()),
        loginHint: hint,
      })
    : await chromeFlow({ clientId: client.clientId, clientSecret: client.clientSecret, loginHint: hint });

  const email = result.email ?? hint ?? "(unknown)";
  const accounts = await loadAccounts();
  let account = accounts.find((a) => a.email === email);
  if (!account) {
    account = {
      id: `acct-${Date.now().toString(36)}-${randomState().slice(0, 6)}`,
      label: email.split("@")[0] ?? email,
      email,
      addedAt: Date.now(),
    };
    accounts.push(account);
    await saveAccounts(accounts);
  }

  await persistSecret(account.id, result.secret);
  dropCachedState(account.id);
  return account;
}

interface AuthOutcome {
  email?: string;
  secret: AccountSecret;
}

/* ------------------------------ Chrome MV3 ------------------------------ */

async function chromeFlow(opts: {
  clientId: string;
  clientSecret?: string;
  loginHint?: string;
}): Promise<AuthOutcome> {
  const details: chrome.identity.WebAuthFlowDetails = {
    url:
      `${OAUTH_AUTH}?response_type=code` +
      `&client_id=${encodeURIComponent(opts.clientId)}` +
      `&redirect_uri=${encodeURIComponent(chrome.identity.getRedirectURL())}` +
      `&scope=${encodeURIComponent(SCOPES.join(" "))}` +
      `&access_type=offline&prompt=consent` +
      (opts.loginHint ? `&login_hint=${encodeURIComponent(opts.loginHint)}` : ""),
    interactive: true,
  };
  const finalUrl = await new Promise<string>((resolve, reject) => {
    chrome.identity.launchWebAuthFlow(details, (url) => {
      const err = chrome.runtime.lastError;
      if (err || !url) reject(new Error(err?.message ?? "auth aborted"));
      else resolve(url);
    });
  });
  const code = new URL(finalUrl).searchParams.get("code");
  if (!code) throw new Error("no authorization code");
  const tokens = await tokenRequest({
    client_id: opts.clientId,
    ...(opts.clientSecret ? { client_secret: opts.clientSecret } : {}),
    code,
    redirect_uri: chrome.identity.getRedirectURL(),
    grant_type: "authorization_code",
  });
  return toOutcome(tokens, opts.clientId);
}

/* ------------------------------ Firefox MV2 ----------------------------- */

async function firefoxFlow(opts: {
  clientId: string;
  clientSecret?: string;
  redirectUrl?: string;
  loginHint?: string;
}): Promise<AuthOutcome> {
  const redirect = opts.redirectUrl ?? browser.identity.getRedirectURL();
  if (!opts.redirectUrl && /^https?:\/\//.test(redirect) === false) {
    // Loopback http(s) redirects are not usable from a background page fetch.
    throw new Error("Firefox requires a https redirect URL registered in the OAuth client.");
  }
  const pkce = await makePkce();
  const url =
    `${OAUTH_AUTH}?response_type=code` +
    `&client_id=${encodeURIComponent(opts.clientId)}` +
    `&redirect_uri=${encodeURIComponent(redirect)}` +
    `&scope=${encodeURIComponent(SCOPES.join(" "))}` +
    `&access_type=offline&prompt=consent` +
    `&code_challenge=${pkce.challenge}&code_challenge_method=S256` +
    (opts.loginHint ? `&login_hint=${encodeURIComponent(opts.loginHint)}` : "");

  const redirectEnd = await browser.identity.launchWebAuthFlow({
    interactive: true,
    url,
  });
  const code = new URL(redirectEnd).searchParams.get("code");
  if (!code) throw new Error("no authorization code");

  const tokens = await tokenRequest({
    client_id: opts.clientId,
    ...(opts.clientSecret ? { client_secret: opts.clientSecret } : {}),
    code,
    redirect_uri: redirect,
    grant_type: "authorization_code",
    code_verifier: pkce.verifier,
  });
  return toOutcome(tokens, opts.clientId);
}

/* -------------------------------- shared -------------------------------- */

interface TokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  id_token?: string;
  /** Space-separated granted scopes (present on token responses). */
  scope?: string;
}

/** The scopes that must be present on every issued token. */
const REQUIRED_SCOPES = ["https://mail.google.com/", "https://www.googleapis.com/auth/userinfo.email"];

function assertScopesGranted(tokens: TokenResponse): void {
  const granted = new Set((tokens.scope ?? "").split(/\s+/).filter(Boolean));
  if (granted.size === 0) return; // endpoint did not echo scopes; let API calls surface problems
  for (const needed of REQUIRED_SCOPES) {
    if (!granted.has(needed)) {
      throw new Error(
        `Google did not grant the Gmail scope (granted: ${[...granted].join(" ") || "none"}). ` +
          `Remove the app from https://myaccount.google.com/permissions and sign in again.`,
      );
    }
  }
}

function toOutcome(tokens: TokenResponse, clientId: string): AuthOutcome {
  return {
    email: extractEmailFromIdToken(tokens.id_token),
    secret: {
      refreshToken: tokens.refresh_token,
      clientId,
    },
  };
}

async function tokenRequest(params: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch(OAUTH_TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params).toString(),
  });
  if (!res.ok) throw new Error(`token endpoint ${res.status}: ${await res.text()}`);
  const tokens = (await res.json()) as TokenResponse;
  assertScopesGranted(tokens);
  return tokens;
}

async function refreshAccessToken(state: AccountState): Promise<AccountState> {
  const account = (await loadAccounts()).find((a) => a.id === state.accountId);
  if (!account) throw new Error("account missing");
  const client = await clientFor(account.id);
  if (!client.clientId) {
    throw new Error(t("noBuiltinBuild"));
  }
  const secret = await loadSecret(account.id);
  if (!secret.refreshToken) throw new Error("no refresh token — re-add the account");
  const tokens = await tokenRequest({
    client_id: client.clientId,
    ...(client.clientSecret ? { client_secret: client.clientSecret } : {}),
    refresh_token: secret.refreshToken,
    grant_type: "refresh_token",
  });
  state.accessToken = tokens.access_token;
  state.expiresAt = Date.now() + tokens.expires_in * 1000 - 30_000;
  if (tokens.refresh_token) secret.refreshToken = tokens.refresh_token;
  await saveSecret(account.id, secret);
  return state;
}

export async function getAccessToken(account: AccountConfig): Promise<string> {
  const cached = getCachedState(account.id);
  if (cached?.accessToken && (cached.expiresAt ?? 0) > Date.now()) return cached.accessToken;
  let state: AccountState = cached ?? { accountId: account.id, email: account.email };
  try {
    state = await refreshAccessToken(state);
  } catch (e) {
    dropCachedState(account.id);
    throw e;
  }
  setCachedState(state);
  return state.accessToken!;
}

export async function signOutAccount(accountId: string): Promise<void> {
  await removeSecret(accountId);
  dropCachedState(accountId);
}
