/**
 * Popup UI. Single-column with two slides (list ⇄ reader), like classic
 * Gmail checkers. Hand-rolled DOM, no framework.
 */
import { api } from "../shared/env";
import { loadAccounts, loadSettings, saveSettings } from "../shared/storage";
import { applyTheme } from "../shared/theme";
import { t } from "../shared/i18n";
import {
  archiveMessages,
  listSummaries,
  markRead,
  moveToTrash,
  readMail,
} from "../shared/gmail";
import type { AccountConfig, MessageSummary, Settings } from "../shared/types";
import { startInteractiveAuth } from "../shared/auth";

interface UiState {
  settings: Settings | null;
  accounts: AccountConfig[];
  currentId: string | null;
  items: MessageSummary[];
  selected: MessageSummary | null;
  body: Awaited<ReturnType<typeof readMail>> | null;
  loadingList: boolean;
  loadingBody: boolean;
  error: string | null;
  query: string;
  unreadOnly: boolean;
}

const S: UiState = {
  settings: null,
  accounts: [],
  currentId: null,
  items: [],
  selected: null,
  body: null,
  loadingList: false,
  loadingBody: false,
  error: null,
  query: "",
  unreadOnly: false,
};

/* ------------------------------ tiny helpers ----------------------------- */

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

function iconButton(symbol: string, title: string, onClick: () => void): HTMLButtonElement {
  const b = el("button", "icon-btn");
  b.type = "button";
  b.textContent = symbol;
  b.title = title;
  b.setAttribute("aria-label", title);
  b.addEventListener("click", onClick);
  return b;
}

function fmtDate(ms: number): string {
  const d = new Date(ms);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  if (d.getFullYear() === now.getFullYear()) return d.toLocaleDateString(undefined, { month: "numeric", day: "numeric" });
  return d.toLocaleDateString(undefined, { year: "numeric", month: "numeric", day: "numeric" });
}

function gmailUrl(account: AccountConfig, view?: string): string {
  const base = `https://mail.google.com/mail/u/${encodeURIComponent(account.email)}`;
  return view ? `${base}/?${view}` : `${base}/`;
}

function notifyBackground(type: string): void {
  void api.runtime.sendMessage({ type }).catch(() => undefined);
}

/* --------------------------------- boot ---------------------------------- */

async function boot(): Promise<void> {
  const [accounts, settings] = await Promise.all([loadAccounts(), loadSettings()]);
  S.accounts = accounts;
  S.settings = settings;
  applyTheme(settings);
  buildSkeleton();
  const last = settings.lastAccount ?? accounts[0]?.id ?? null;
  if (last && accounts.some((a) => a.id === last)) {
    await switchAccount(last);
  } else if (accounts.length > 0) {
    await switchAccount(accounts[0]!.id);
  } else {
    renderNoAccounts();
  }
}

/* ------------------------------- skeleton -------------------------------- */

let listPane: HTMLElement;
let readerPane: HTMLElement;
let accountSelect: HTMLSelectElement;

function buildSkeleton(): void {
  document.title = "easy-mail-checker";

  const header = el("header", "topbar");

  accountSelect = el("select", "account-select") as HTMLSelectElement;
  accountSelect.addEventListener("change", () => void switchAccount(accountSelect.value));
  rebuildAccountOptions();

  const addBtn = iconButton("+", t("addAccount"), () => void addAccount());
  addBtn.classList.add("accent-btn");

  const refreshBtn = iconButton("⟳", t("refresh"), () => void loadList(true));
  const composeBtn = iconButton("✎", t("compose"), () => {
    const acc = currentAccount();
    if (acc) window.open(gmailUrl(acc, "view=cm"), "_blank");
  });

  const themeBtn = iconButton("◐", t("theme"), () => void cycleTheme());
  const gearBtn = iconButton("⚙", t("settings"), () => api.runtime.openOptionsPage());

  header.append(accountSelect, addBtn, composeBtn, refreshBtn, themeBtn, gearBtn);

  const searchBar = el("div", "searchbar");
  const input = el("input", "search-input") as HTMLInputElement;
  input.type = "search";
  input.placeholder = t("search");
  input.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter") {
      S.query = input.value.trim();
      S.unreadOnly = false;
      void loadList(true);
    }
  });
  const unreadBtn = iconButton("◉", t("inbox"), () => {
    S.unreadOnly = !S.unreadOnly;
    unreadBtn.classList.toggle("active", S.unreadOnly);
    void loadList(true);
  });
  searchBar.append(input, unreadBtn);

  listPane = el("main", "pane list-pane");
  readerPane = el("main", "pane reader-pane");

  const root = el("div", "app");
  root.append(header, searchBar, listPane, readerPane);
  document.body.replaceChildren(root);
}

function rebuildAccountOptions(): void {
  accountSelect.replaceChildren();
  for (const acc of S.accounts) {
    const opt = el("option", undefined, acc.label || acc.email) as HTMLOptionElement;
    opt.value = acc.id;
    accountSelect.append(opt);
  }
  if (S.currentId) accountSelect.value = S.currentId;
}

function currentAccount(): AccountConfig | null {
  return S.accounts.find((a) => a.id === S.currentId) ?? null;
}

/* ------------------------------ data actions ------------------------------ */

async function addAccount(): Promise<void> {
  try {
    const account = await startInteractiveAuth();
    if (!S.accounts.some((a) => a.id === account.id)) S.accounts.push(account);
    S.settings && (await saveSettings({ ...S.settings, lastAccount: account.id }));
    await switchAccount(account.id);
  } catch (e) {
    showError(`${t("authError")}: ${e instanceof Error ? e.message : String(e)}`);
  }
}

async function switchAccount(id: string): Promise<void> {
  S.currentId = id;
  S.selected = null;
  S.body = null;
  hideReader();
  rebuildAccountOptions();
  if (S.settings) {
    S.settings.lastAccount = id;
    void saveSettings(S.settings);
  }
  await loadList(true);
}

async function loadList(showLoading: boolean): Promise<void> {
  const acc = currentAccount();
  if (!acc) return;
  if (showLoading) {
    S.loadingList = true;
    renderList();
  }
  S.error = null;
  try {
    const q = [S.query || undefined, S.unreadOnly ? "is:unread" : undefined].filter(Boolean).join(" ") || undefined;
    const page = await listSummaries(acc, { maxResults: S.settings?.pageSize ?? 25, q });
    S.items = page.items;
  } catch (e) {
    S.error = e instanceof Error ? e.message : String(e);
  } finally {
    S.loadingList = false;
    renderList();
    notifyBackground("refresh");
  }
}

async function openMessage(id: string): Promise<void> {
  const acc = currentAccount();
  if (!acc) return;
  S.loadingBody = true;
  S.error = null;
  showReader();
  renderReader();
  try {
    const mail = await readMail(acc, id);
    S.body = mail;
    S.selected = mail.summary;
    renderReader();
    if (mail.summary.unread) {
      await markRead(acc, [id], true);
      const local = S.items.find((i) => i.id === id);
      if (local) local.unread = false;
      renderList();
      notifyBackground("refresh");
    }
  } catch (e) {
    S.error = e instanceof Error ? e.message : String(e);
    renderReader();
  } finally {
    S.loadingBody = false;
  }
}

async function toggleRead(item: MessageSummary): Promise<void> {
  const acc = currentAccount();
  if (!acc) return;
  await markRead(acc, [item.id], item.unread);
  item.unread = !item.unread;
  renderList();
  notifyBackground("refresh");
}

async function trashItem(item: MessageSummary): Promise<void> {
  const acc = currentAccount();
  if (!acc) return;
  await moveToTrash(acc, [item.id]);
  S.items = S.items.filter((i) => i.id !== item.id);
  if (S.selected?.id === item.id) {
    S.selected = null;
    S.body = null;
    hideReader();
  }
  renderList();
  notifyBackground("refresh");
}

async function archiveSelected(): Promise<void> {
  const acc = currentAccount();
  if (!acc || !S.selected) return;
  await archiveMessages(acc, [S.selected.id]);
  S.items = S.items.filter((i) => i.id !== S.selected!.id);
  S.selected = null;
  S.body = null;
  hideReader();
  renderList();
  notifyBackground("refresh");
}

async function cycleTheme(): Promise<void> {
  if (!S.settings) return;
  const order: Settings["themeMode"][] = ["system", "light", "dark"];
  const idx = order.indexOf(S.settings.themeMode);
  S.settings.themeMode = order[(idx + 1) % order.length] ?? "system";
  applyTheme(S.settings);
  await saveSettings(S.settings);
}

/* -------------------------------- rendering ------------------------------ */

function showError(message: string): void {
  S.error = message;
  renderList();
}

function renderNoAccounts(): void {
  const box = el("div", "empty");
  const btn = el("button", "accent-btn big", t("addAccount"));
  btn.addEventListener("click", () => void addAccount());
  box.append(el("p", "muted", "→ Gmail"), btn);
  listPane.replaceChildren(box);
}

function renderList(): void {
  if (S.loadingList) {
    listPane.replaceChildren(el("div", "empty", t("loading")));
    return;
  }
  if (S.error && S.items.length === 0) {
    const box = el("div", "error-box", `${t("loadError")}: ${S.error}`);
    listPane.replaceChildren(box);
    return;
  }
  if (S.items.length === 0) {
    listPane.replaceChildren(el("div", "empty", t("noMail")));
    return;
  }
  const ul = el("ul", "mail-list");
  for (const item of S.items) {
    ul.append(renderRow(item));
  }
  listPane.replaceChildren(ul);
}

function renderRow(item: MessageSummary): HTMLLIElement {
  const li = el("li", item.unread ? "mail-row unread" : "mail-row");

  const top = el("div", "row-top");
  const from = el("span", "row-from", item.fromName || item.from);
  const date = el("span", "row-date", fmtDate(item.date));
  top.append(from, date);

  const subj = el("div", "row-subject", item.subject);
  const snip = el("div", "row-snippet", item.snippet);

  const quick = el("div", "row-actions");
  quick.append(
    iconButton(item.unread ? "✉" : "✓", item.unread ? t("markRead") : t("markUnread"), () => void toggleRead(item)),
    iconButton("🗑", t("trash"), () => void trashItem(item)),
  );

  const main = el("div", "row-main");
  main.append(top, subj, snip);
  main.addEventListener("click", () => void openMessage(item.id));
  li.append(main, quick);
  return li;
}

function showReader(): void {
  document.querySelector(".app")?.classList.add("reader-open");
}

function hideReader(): void {
  document.querySelector(".app")?.classList.remove("reader-open");
}

function renderReader(): void {
  const wrap = el("div", "reader");

  const bar = el("div", "reader-bar");
  const backBtn = iconButton("←", t("back"), () => {
    S.selected = null;
    S.body = null;
    hideReader();
  });
  bar.append(backBtn);
  if (S.selected) {
    bar.append(
      iconButton("✓", t("markUnread"), () => {
        const sel = S.selected;
        if (sel) {
          sel.unread = true;
          void markRead(currentAccount()!, [sel.id], false).then(() => {
            renderList();
            notifyBackground("refresh");
          });
        }
        S.selected = null;
        S.body = null;
        hideReader();
      }),
      iconButton("📦", t("archive"), () => void archiveSelected()),
      iconButton("🗑", t("trash"), () => {
        const sel = S.selected;
        if (sel) void trashItem(sel);
      }),
    );
  }
  const openBtn = iconButton("↗", t("openInGmail"), () => {
    const acc = currentAccount();
    if (acc) window.open(gmailUrl(acc, `view=om`), "_blank");
  });
  bar.append(openBtn);
  wrap.append(bar);

  if (S.loadingBody) {
    wrap.append(el("div", "empty", t("loading")));
    readerPane.replaceChildren(wrap);
    return;
  }
  if (S.error) {
    wrap.append(el("div", "error-box", `${t("loadError")}: ${S.error}`));
    readerPane.replaceChildren(wrap);
    return;
  }
  if (!S.body) {
    readerPane.replaceChildren(wrap);
    return;
  }

  const head = el("div", "mail-head");
  head.append(
    el("h1", "mail-subject", S.body.summary.subject),
    el("div", "mail-from", `${S.body.summary.fromName} <${S.body.summary.from}>`),
    el("div", "mail-to", `to: ${S.body.summary.to}`),
    el("div", "mail-date", new Date(S.body.summary.date).toLocaleString()),
  );
  wrap.append(head);

  const frameBox = el("div", "mail-body");
  if (S.body.html) {
    const frame = document.createElement("iframe");
    frame.className = "mail-frame";
    // No scripts, no same-origin: remote content cannot touch the extension.
    frame.setAttribute("sandbox", "allow-popups allow-popups-to-escape-sandbox");
    frame.srcdoc = S.body.html;
    frameBox.append(frame);
  } else {
    const pre = el("pre", "mail-text", S.body.text ?? "");
    frameBox.append(pre);
  }
  wrap.append(frameBox);

  if (S.body.attachments.length > 0) {
    const atts = el("div", "attachments");
    for (const a of S.body.attachments) {
      atts.append(el("span", "attachment", `📎 ${a.filename} (${Math.max(1, Math.round(a.size / 1024))} KB)`));
    }
    wrap.append(atts);
  }

  readerPane.replaceChildren(wrap);
}

void boot();
