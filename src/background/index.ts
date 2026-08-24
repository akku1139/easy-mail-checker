/**
 * Background core shared by both targets:
 *  - Chrome MV3: service worker (ESM)
 *  - Firefox MV2: event page (IIFE)
 *
 * Responsibilities: periodic unread polling, badge rendering, broadcasting
 * account states to any open popup. All Gmail calls go through src/shared.
 */
import { api } from "../shared/env";
import { loadAccounts, loadSettings } from "../shared/storage";
import { loadStates, saveStates } from "./states";
import { refreshAccountState } from "../shared/gmail";
import type { AccountState } from "../shared/types";

const ALARM = "emc-poll";

type ActionApi = {
  setBadgeText: (d: { text: string }) => void;
  setBadgeBackgroundColor: (d: { color: string }) => void;
};

function button(): ActionApi | undefined {
  const a = api as any;
  return a.action ?? a.browserAction;
}

async function pollAll(): Promise<void> {
  const [accounts, settings] = await Promise.all([loadAccounts(), loadSettings()]);
  const prev = await loadStates();
  const next: Record<string, AccountState> = {};

  for (const account of accounts) {
    try {
      next[account.id] = await refreshAccountState(account, prev[account.id]);
    } catch (e) {
      next[account.id] = {
        accountId: account.id,
        email: prev[account.id]?.email ?? account.email,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  }

  await saveStates(next);

  if (settings.badgeEnabled) {
    const total = Object.values(next).reduce((sum, s) => sum + (s.unreadCount ?? 0), 0);
    const btn = button();
    if (btn) {
      btn.setBadgeBackgroundColor({ color: "#4a90d9" });
      btn.setBadgeText({ text: total > 0 ? (total > 999 ? "999+" : String(total)) : "" });
    }
  }

  // Fire-and-forget broadcast; popup may or may not be listening.
  try {
    await api.runtime.sendMessage({ type: "states-updated" });
  } catch {
    /* no receivers */
  }
}

async function schedule(): Promise<void> {
  const settings = await loadSettings();
  const minutes = Math.max(1, Math.round(settings.pollSeconds / 60));
  api.alarms.clear(ALARM);
  api.alarms.create(ALARM, { periodInMinutes: minutes });
}

export function initBackground(): void {
  api.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === ALARM) void pollAll();
  });

  api.runtime.onInstalled.addListener(() => {
    void (async () => {
      await schedule();
      await pollAll();
    })();
  });

  api.runtime.onStartup.addListener(() => {
    void (async () => {
      await schedule();
      await pollAll();
    })();
  });

  api.runtime.onMessage.addListener((msg: unknown) => {
    if ((msg as any)?.type === "refresh") {
      void pollAll();
    }
    if ((msg as any)?.type === "reschedule") {
      void schedule();
    }
    return undefined;
  });

  void (async () => {
    // Keep persisted poll interval fresh across updates.
    await schedule();
    await pollAll();
  })();
}

// Service worker / event page entry: start listening immediately.
initBackground();
