import type { AccountSecret } from "./types";

/**
 * Refresh tokens live under one storage key so "sign out" / "remove account"
 * wipes exactly one entry. They never leave extension storage.
 */
const SECRETS_KEY = "secrets.v1";

function area(): chrome.storage.StorageArea {
  return (globalThis as any).browser?.storage?.local ?? globalThis.chrome.storage.local;
}

async function readAll(): Promise<Record<string, AccountSecret>> {
  const res = (await area().get(SECRETS_KEY)) as Record<string, unknown>;
  return (res[SECRETS_KEY] as Record<string, AccountSecret>) ?? {};
}

export async function loadSecret(accountId: string): Promise<AccountSecret> {
  return (await readAll())[accountId] ?? {};
}

export async function persistSecret(accountId: string, secret: AccountSecret): Promise<void> {
  const all = await readAll();
  all[accountId] = secret;
  await area().set({ [SECRETS_KEY]: all });
}

export const saveSecret = persistSecret;

export async function removeSecret(accountId: string): Promise<void> {
  const all = await readAll();
  delete all[accountId];
  await area().set({ [SECRETS_KEY]: all });
}
