import type { AccountConfig, AccountState, Settings } from "./types";

const ACCOUNTS_KEY = "accounts.v1";
const SETTINGS_KEY = "settings.v1";

export const DEFAULT_SETTINGS: Settings = {
  themeMode: "system",
  accent: "blue",
  pollSeconds: 60,
  badgeEnabled: true,
  pageSize: 25,
  clients: {},
  lastAccount: null,
};

function getArea(): chrome.storage.StorageArea {
  // storage.sync is quota-limited and cannot hold client IDs comfortably; keep everything local.
  return (globalThis as any).browser?.storage?.local ?? globalThis.chrome.storage.local;
}

export async function loadAccounts(): Promise<AccountConfig[]> {
  const st = getArea().get(ACCOUNTS_KEY);
  const raw = ((await st) as Record<string, unknown>)[ACCOUNTS_KEY];
  return Array.isArray(raw) ? (raw as AccountConfig[]) : [];
}

export async function saveAccounts(accounts: AccountConfig[]): Promise<void> {
  await getArea().set({ [ACCOUNTS_KEY]: accounts });
}

export async function loadSettings(): Promise<Settings> {
  const st = getArea().get(SETTINGS_KEY);
  const raw = ((await st) as Record<string, unknown>)[SETTINGS_KEY] as Partial<Settings> | undefined;
  return { ...DEFAULT_SETTINGS, ...raw, clients: { ...(raw?.clients ?? {}) } };
}

export async function saveSettings(settings: Settings): Promise<void> {
  await getArea().set({ [SETTINGS_KEY]: settings });
}

/** In-memory session cache; MV3 service workers lose this on suspension — that is fine, we re-auth lazily. */
const stateCache = new Map<string, AccountState>();

export function getCachedState(accountId: string): AccountState | undefined {
  return stateCache.get(accountId);
}

export function setCachedState(state: AccountState): void {
  stateCache.set(state.accountId, state);
}

export function dropCachedState(accountId: string): void {
  stateCache.delete(accountId);
}
