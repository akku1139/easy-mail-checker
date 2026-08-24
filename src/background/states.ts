import type { AccountState } from "../shared/types";

const STATES_KEY = "states.v1";

/** Last-known per-account state (unread count etc.) for instant popup paint. */
export async function loadStates(): Promise<Record<string, AccountState>> {
  const area = (globalThis as any).browser?.storage?.local ?? globalThis.chrome.storage.local;
  const res = (await area.get(STATES_KEY)) as Record<string, unknown>;
  return (res[STATES_KEY] as Record<string, AccountState>) ?? {};
}

export async function saveStates(states: Record<string, AccountState>): Promise<void> {
  const area = (globalThis as any).browser?.storage?.local ?? globalThis.chrome.storage.local;
  await area.set({ [STATES_KEY]: states });
}
