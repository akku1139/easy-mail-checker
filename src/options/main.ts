/**
 * Options page: appearance (theme/accent), polling, badge, page size,
 * account management and per-account OAuth client overrides.
 */
import { api } from "../shared/env";
import { loadAccounts, loadSettings, saveAccounts, saveSettings } from "../shared/storage";
import { signOutAccount } from "../shared/auth";
import { applyTheme, ACCENTS } from "../shared/theme";
import { t } from "../shared/i18n";
import type { Accent, ThemeMode } from "../shared/types";
import { hasBuiltinClient, firefoxRedirectUrl } from "../background/oauth-config";
import { BUILD_ID } from "../shared/env";

/** Avatar hue consistent with the popup sidebar. */
function hueFor(value: string): number {
  let sum = 0;
  for (const ch of value) sum = (sum + ch.charCodeAt(0) * 31) % 360;
  return sum;
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

async function boot(): Promise<void> {
  const [accounts, settings] = await Promise.all([loadAccounts(), loadSettings()]);
  const root = el("div", "options");

  root.append(el("h1", undefined, `${t("settings")} — easy-mail-checker`));

  /* ------------------------------- appearance ------------------------------ */

  const appSection = el("section", "card");
  appSection.append(el("h2", undefined, t("theme")));

  const modeRow = el("div", "row");
  for (const m of ["system", "light", "dark"] as ThemeMode[]) {
    const label = el("label", "radio");
    const input = Object.assign(el("input"), { type: "radio", name: "themeMode", value: m }) as HTMLInputElement;
    input.checked = settings.themeMode === m;
    input.addEventListener("change", () => {
      if (input.checked) {
        settings.themeMode = m;
        applyTheme(settings);
      }
    });
    label.append(input, el("span", undefined, t(m)));
    modeRow.append(label);
  }
  appSection.append(modeRow);

  const accentRow = el("div", "row");
  for (const a of ACCENTS) {
    const label = el("label", "radio");
    const input = Object.assign(el("input"), { type: "radio", name: "accent", value: a }) as HTMLInputElement;
    input.checked = settings.accent === a;
    input.addEventListener("change", () => {
      if (input.checked) {
        settings.accent = a as Accent;
        applyTheme(settings);
      }
    });
    label.append(input, el("span", undefined, t(a)));
    accentRow.append(label);
  }
  appSection.append(accentRow);

  /* --------------------------------- polling ------------------------------- */

  const pollSection = el("section", "card");
  pollSection.append(el("h2", undefined, t("pollInterval")));

  const pollRow = el("div", "row");
  const pollInput = Object.assign(el("input"), { type: "number", min: "30", max: "3600" }) as HTMLInputElement;
  pollInput.value = String(settings.pollSeconds);
  pollInput.addEventListener("change", () => {
    settings.pollSeconds = Math.max(30, Math.min(3600, Number(pollInput.value) || 60));
    pollInput.value = String(settings.pollSeconds);
  });
  pollRow.append(pollInput);
  pollSection.append(pollRow);

  const badgeRow = el("label", "row check");
  const badgeInput = Object.assign(el("input"), { type: "checkbox" }) as HTMLInputElement;
  badgeInput.checked = settings.badgeEnabled;
  badgeInput.addEventListener("change", () => (settings.badgeEnabled = badgeInput.checked));
  badgeRow.append(badgeInput, el("span", undefined, t("badge")));
  pollSection.append(badgeRow);

  const sizeRow = el("div", "row");
  const sizeInput = Object.assign(el("input"), { type: "number", min: "10", max: "100" }) as HTMLInputElement;
  sizeInput.value = String(settings.pageSize);
  sizeInput.addEventListener("change", () => {
    settings.pageSize = Math.max(10, Math.min(100, Number(sizeInput.value) || 25));
    sizeInput.value = String(settings.pageSize);
  });
  sizeRow.append(el("span", undefined, t("pageSize")), sizeInput);
  pollSection.append(sizeRow);

  /* -------------------------------- accounts ------------------------------- */

  const accSection = el("section", "card");
  accSection.append(el("h2", undefined, t("accounts")));

  const listBox = el("div", "account-list");
  accSection.append(listBox);

  const renderAccountRows = (): void => {
    listBox.replaceChildren();
    accounts.forEach((acc, idx) => {
      const row = el("div", "account-row");

      const label = el("span", "account-email");
      const avatar = el("span", "avatar sm");
      avatar.style.background = `hsl(${hueFor(acc.email)} 55% 45%)`;
      avatar.textContent = (acc.label || acc.email)[0]?.toUpperCase() ?? "?";
      label.append(avatar, el("span", undefined, acc.email));
      if (idx === 0) label.append(el("span", "order-hint", `· ${t("first")}`));

      const controls = el("span", "order-controls");
      const up = Object.assign(el("button"), { type: "button" }) as HTMLButtonElement;
      up.textContent = "↑";
      up.className = "icon-btn";
      up.title = t("moveUp");
      up.disabled = idx === 0;
      up.addEventListener("click", () => move(idx, -1));
      const down = Object.assign(el("button"), { type: "button" }) as HTMLButtonElement;
      down.textContent = "↓";
      down.className = "icon-btn";
      down.title = t("moveDown");
      down.disabled = idx === accounts.length - 1;
      down.addEventListener("click", () => move(idx, 1));
      controls.append(up, down);

      const rm = el("button", "danger-btn", t("removeAccount"));
      rm.type = "button";
      rm.addEventListener("click", async () => {
        await signOutAccount(acc.id);
        accounts.splice(idx, 1);
        await saveAccounts(accounts);
        renderAccountRows();
      });

      row.append(label, controls, rm);
      listBox.append(row);
    });
    if (accounts.length === 0) listBox.append(el("p", "muted", t("addAccount")));
  };

  /** Reorder locally and persist immediately (popup order follows on next open). */
  const move = async (index: number, delta: number): Promise<void> => {
    const target = index + delta;
    if (target < 0 || target >= accounts.length) return;
    const [item] = accounts.splice(index, 1);
    if (!item) return;
    accounts.splice(target, 0, item);
    await saveAccounts(accounts);
    renderAccountRows();
  };

  renderAccountRows();

  /* ------------------------------ oauth clients ---------------------------- */

  const clientSection = el("section", "card");
  clientSection.append(el("h2", undefined, t("oauthClients")));

  const mkField = (
    labelText: string,
    value: string,
    onChange: (v: string) => void,
    placeholder?: string,
  ): HTMLElement => {
    const wrap = el("label", "field");
    wrap.append(el("span", undefined, labelText));
    const inp = Object.assign(el("input"), { type: "text" }) as HTMLInputElement;
    inp.value = value;
    inp.placeholder = placeholder ?? "";
    inp.addEventListener("change", () => onChange(inp.value.trim()));
    wrap.append(inp);
    return wrap;
  };

  const def = settings.clients["__default__"] ?? {};

  // Built-in client status: users of a signed release build need none of this.
  const builtinRow = el("p", "builtin-status");
  builtinRow.textContent = hasBuiltinClient() ? "✓ " + t("builtinClient") : "! " + t("noBuiltinClient");
  if (BUILD_ID && BUILD_ID !== "dev") builtinRow.textContent += ` · ${BUILD_ID}`;
  builtinRow.classList.add(hasBuiltinClient() ? "ok" : "warn");
  clientSection.append(builtinRow);

  // Firefox-only: show the redirect URL to register in the OAuth client.
  if (api.runtime.getManifest().manifest_version === 2) {
    const redirect = def.redirectUrl ?? (await firefoxRedirectUrl());
    const redirectWrap = el("div", "field");
    redirectWrap.append(el("span", undefined, t("redirectUrl")));
    const redirectBox = el("div", "redirect-row");
    const redirectInput = Object.assign(el("input"), { type: "text" }) as HTMLInputElement;
    redirectInput.readOnly = true;
    redirectInput.value = redirect;
    const copyBtn = el("button", "accent-btn", t("copy"));
    copyBtn.type = "button";
    copyBtn.addEventListener("click", async () => {
      await navigator.clipboard.writeText(redirectInput.value);
      copyBtn.textContent = t("copied");
      window.setTimeout(() => (copyBtn.textContent = t("copy")), 1200);
    });
    redirectBox.append(redirectInput, copyBtn);
    redirectWrap.append(redirectBox);
    clientSection.append(redirectWrap);
  }

  clientSection.append(
    mkField(t("clientId"), def.clientId ?? "", (v) => {
      settings.clients["__default__"] = { ...def, clientId: v || undefined };
    }),
    mkField(t("clientSecret"), def.clientSecret ?? "", (v) => {
      settings.clients["__default__"] = { ...settings.clients["__default__"], clientSecret: v || undefined };
    }, "•••••"),
  );
  if (api.runtime.getManifest().manifest_version === 2) {
    clientSection.append(
      mkField(
        t("redirectUrl"),
        def.redirectUrl ?? "",
        (v) => {
          settings.clients["__default__"] = { ...settings.clients["__default__"], redirectUrl: v || undefined };
        },
        "https://xxx.extensions.allizom.org/",
      ),
    );
  }

  const saveBar = el("div", "savebar");
  const saveBtn = el("button", "accent-btn big", t("save"));
  saveBtn.type = "button";
  const status = el("span", "muted");
  saveBtn.addEventListener("click", async () => {
    await saveSettings(settings);
    status.textContent = t("saved");
    api.runtime.sendMessage({ type: "reschedule" }).catch(() => undefined);
    window.setTimeout(() => (status.textContent = ""), 1500);
  });
  saveBar.append(saveBtn, status);

  root.append(appSection, pollSection, accSection, clientSection, saveBar);
  document.body.replaceChildren(root);
}

void boot();
