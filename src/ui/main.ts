/**
 * Popup UI — wide two-column layout:
 *   [account rail] [merged inbox (all accounts, sequential sections)] ⇄ [reader]
 * Hand-rolled DOM, no framework.
 */
import { api } from "../shared/env";
import { loadAccounts, loadSettings, saveSettings } from "../shared/storage";
import { loadStates } from "../background/states";
import { applyTheme } from "../shared/theme";
import { t } from "../shared/i18n";
import {
  archiveMessages,
  listSummaries,
  markRead,
  moveToTrash,
  readMail,
} from "../shared/gmail";
import type { AccountConfig, MessageSummary, Settings, AccountState } from "../shared/types";
import { startInteractiveAuth } from "../shared/auth";

/** A list row: the Gmail summary tagged with the account it belongs to. */
type Row = MessageSummary & { accountId: string };

interface Group {
  account: AccountConfig;
  items: Row[];
  loading: boolean;
  error: string | null;
}

interface UiState {
  settings: Settings | null;
  accounts: AccountConfig[];
  states: Record<string, AccountState>;
  groups: Group[];
  selected: Row | null;
  body: Awaited<ReturnType<typeof readMail>> | null;
  selectedAccountId: string | null;
  loadingBody: boolean;
  error: string | null;
  query: string;
  unreadOnly: boolean;
}

const S: UiState = {
  settings: null,
  accounts: [],
  states: {},
  groups: [],
  selected: null,
  body: null,
  selectedAccountId: null,
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
  b.addEventListener("click", (ev) => {
    ev.stopPropagation();
    onClick();
  });
  return b;
}

function initials(value: string): string {
  const name = value.split("@")[0] ?? value;
  return (name[0] ?? "?").toUpperCase();
}

function hueFor(value: string): number {
  let sum = 0;
  for (const ch of value) sum = (sum + ch.charCodeAt(0) * 31) % 360;
  return sum;
}

function fmtDate(ms: number): string {
  const d = new Date(ms);
  const now = new Date();
  if (d.toDateString() === now.toDateString())
    return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  if (d.getFullYear() === now.getFullYear())
    return d.toLocaleDateString(undefined, { month: "numeric", day: "numeric" });
  return d.toLocaleDateString();
}

function gmailUrl(account: AccountConfig, view?: string): string {
  const base = `https://mail.google.com/mail/u/${encodeURIComponent(account.email)}`;
  return view ? `${base}/?${view}` : `${base}/`;
}

function notifyBackground(type: string): void {
  void api.runtime.sendMessage({ type }).catch(() => undefined);
}

function accountById(id: string | null | undefined): AccountConfig | null {
  return S.accounts.find((a) => a.id === id) ?? null;
}

function unreadTotal(accountId: string): number | undefined {
  return S.states[accountId]?.unreadCount;
}

/* --------------------------------- boot ---------------------------------- */

async function boot(): Promise<void> {
  const [accounts, settings, states] = await Promise.all([loadAccounts(), loadSettings(), loadStates()]);
  S.accounts = accounts;
  S.settings = settings;
  S.states = states;
  S.groups = accounts.map((account) => ({ account, items: [], loading: true, error: null }));
  applyTheme(settings);
  buildSkeleton();

  api.runtime.onMessage.addListener((msg: unknown) => {
    if ((msg as any)?.type === "states-updated") {
      void loadStates().then((st) => {
        S.states = st;
        updateCounts();
      });
    }
    return undefined;
  });

  if (accounts.length === 0) renderNoAccounts();
  else void loadAll();
}

async function loadAll(): Promise<void> {
  await Promise.all(S.groups.map((g) => loadGroup(g, true)));
}

async function loadGroup(group: Group, showLoading: boolean): Promise<void> {
  if (showLoading) {
    group.loading = true;
    renderSections();
  }
  group.error = null;
  const q = [S.query || undefined, S.unreadOnly ? "is:unread" : undefined].filter(Boolean).join(" ") || undefined;
  try {
    const page = await listSummaries(group.account, {
      maxResults: S.settings?.pageSize ?? 25,
      q,
    });
    group.items = page.items.map((m) => ({ ...m, accountId: group.account.id }));
  } catch (e) {
    group.error = e instanceof Error ? e.message : String(e);
  } finally {
    group.loading = false;
    renderSections();
  }
}

/* ------------------------------- skeleton -------------------------------- */

let listPane: HTMLElement;
let readerPane: HTMLElement;

function buildSkeleton(): void {
  document.title = "easy-mail-checker";

  const header = el("header", "topbar");
  header.append(el("span", "brand", "✉ easy-mail-checker"));

  const addBtn = iconButton("+", t("addAccount"), () => void addAccount());
  const composeBtn = iconButton("✎", t("compose"), () => {
    const first = S.accounts[0];
    if (first) window.open(gmailUrl(first, "view=cm"), "_blank");
  });
  const refreshBtn = iconButton("⟳", t("refresh"), () => void loadAll());
  const themeBtn = iconButton("◐", t("theme"), () => void cycleTheme());
  const gearBtn = iconButton("⚙", t("settings"), () => api.runtime.openOptionsPage());
  header.append(addBtn, composeBtn, refreshBtn, themeBtn, gearBtn);

  const searchBar = el("div", "searchbar");
  const input = el("input", "search-input") as HTMLInputElement;
  input.type = "search";
  input.placeholder = `${t("search")} (${t("inbox")})`;
  input.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter") {
      S.query = input.value.trim();
      void loadAll();
    }
  });
  const unreadBtn = iconButton("◉", t("inbox"), () => {
    S.unreadOnly = !S.unreadOnly;
    unreadBtn.classList.toggle("active", S.unreadOnly);
    void loadAll();
  });
  searchBar.append(input, unreadBtn);

  const side = el("nav", "side");
  const maincol = el("div", "maincol");
  listPane = el("main", "pane list-pane");
  readerPane = el("main", "pane reader-pane");
  maincol.append(listPane, readerPane);

  const content = el("div", "content");
  content.append(side, maincol);

  const root = el("div", "app");
  root.append(header, searchBar, content);
  document.body.replaceChildren(root);
  renderSidebar();
}

function sideEl(): HTMLElement {
  return document.querySelector(".side") as HTMLElement;
}

/* ------------------------------- sidebar --------------------------------- */

function renderSidebar(): void {
  const side = sideEl();
  side.replaceChildren();
  for (const account of S.accounts) {
    const btn = el("button", "side-btn");
    btn.type = "button";
    btn.title = account.email;
    const avatar = el("span", "avatar", initials(account.label || account.email));
    avatar.style.background = `hsl(${hueFor(account.email)} 55% 45%)`;
    btn.append(avatar);
    const n = unreadTotal(account.id);
    if (n && n > 0) btn.append(el("span", "badge", n > 99 ? "99+" : String(n)));
    btn.addEventListener("click", () => {
      document
        .querySelector(`[data-acct="${account.id}"]`)
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
      // scrollIntoView can also nudge ancestor scrollers; snap them back so only
      // .list-pane moves — the rail must never scroll with the content.
      const maincol = document.querySelector(".maincol");
      if (maincol) requestAnimationFrame(() => (maincol.scrollTop = 0));
    });
    side.append(btn);
  }
}

/** Update just the numbers (sidebar badges + section counters) without rebuilding lists. */
function updateCounts(): void {
  renderSidebar();
  for (const group of S.groups) {
    const span = document.querySelector(`.acct-count[data-acct="${group.account.id}"]`);
    if (span) span.textContent = countLabel(group);
  }
}

function countLabel(group: Group): string {
  const n = unreadTotal(group.account.id);
  return n !== undefined ? String(n) : String(group.items.length);
}

/* ------------------------------ data actions ----------------------------- */

async function addAccount(): Promise<void> {
  try {
    const account = await startInteractiveAuth();
    if (!S.accounts.some((a) => a.id === account.id)) {
      S.accounts.push(account);
      const group: Group = { account, items: [], loading: true, error: null };
      S.groups.push(group);
      renderSidebar();
      renderSections();
      await loadGroup(group, false);
    }
    if (S.settings) {
      S.settings.lastAccount = account.id;
      void saveSettings(S.settings);
    }
  } catch (e) {
    showError(`${t("authError")}: ${e instanceof Error ? e.message : String(e)}`);
  }
}

async function openMessage(row: Row): Promise<void> {
  const acc = accountById(row.accountId);
  if (!acc) return;
  S.loadingBody = true;
  S.error = null;
  S.selected = row;
  S.selectedAccountId = acc.id;
  showReader();
  renderReader();
  try {
    const mail = await readMail(acc, row.id);
    S.body = mail;
    renderReader();
    if (mail.summary.unread) {
      await markRead(acc, [row.id], true);
      row.unread = false;
      renderSections();
      notifyBackground("refresh");
    }
  } catch (e) {
    S.error = e instanceof Error ? e.message : String(e);
    renderReader();
  } finally {
    S.loadingBody = false;
  }
}

async function toggleRead(row: Row): Promise<void> {
  const acc = accountById(row.accountId);
  if (!acc) return;
  await markRead(acc, [row.id], row.unread);
  row.unread = !row.unread;
  renderSections();
  notifyBackground("refresh");
}

async function trashRow(row: Row): Promise<void> {
  const acc = accountById(row.accountId);
  if (!acc) return;
  await moveToTrash(acc, [row.id]);
  removeRow(row);
  notifyBackground("refresh");
}

async function archiveRow(row: Row): Promise<void> {
  const acc = accountById(row.accountId);
  if (!acc) return;
  await archiveMessages(acc, [row.id]);
  removeRow(row);
  notifyBackground("refresh");
}

function removeRow(row: Row): void {
  const group = S.groups.find((g) => g.account.id === row.accountId);
  if (group) group.items = group.items.filter((i) => i.id !== row.id);
  if (S.selected?.id === row.id) closeReader();
  renderSections();
}

function closeReader(): void {
  S.selected = null;
  S.body = null;
  hideReader();
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
  listPane?.replaceChildren(el("div", "error-box", message));
}

function renderNoAccounts(): void {
  const box = el("div", "onboard");
  box.append(el("div", "onboard-logo", "✉"));
  box.append(el("h1", "onboard-title", "easy-mail-checker"));
  box.append(el("p", "muted tagline", t("tagline")));
  const btn = el("button", "accent-btn big");
  btn.textContent = t("signInWithGoogle");
  btn.addEventListener("click", () => void addAccount());
  const gear = el("button", "link-btn", t("openSettings"));
  gear.type = "button";
  gear.addEventListener("click", () => api.runtime.openOptionsPage());
  box.append(btn, gear);
  listPane.replaceChildren(box);
}

function renderSections(): void {
  const scroller = listPane;
  const keep = scroller.scrollTop;
  const frag = document.createDocumentFragment();
  for (const group of S.groups) frag.append(renderGroupSection(group));
  listPane.replaceChildren(frag);
  // re-render happens on every group load; avoid jumping the viewport
  if (!document.querySelector(".app")?.classList.contains("reader-open")) {
    scroller.scrollTop = keep;
  }
}

function renderGroupSection(group: Group): HTMLElement {
  const section = el("section", "acct-section");
  section.dataset.acct = group.account.id;

  const head = el("header", "acct-head");
  const avatar = el("span", "avatar sm", initials(group.account.label || group.account.email));
  avatar.style.background = `hsl(${hueFor(group.account.email)} 55% 45%)`;
  const title = el("span", "acct-name", group.account.label || group.account.email);
  const count = el("span", "acct-count");
  count.dataset.acct = group.account.id;
  count.textContent = countLabel(group);
  const open = iconButton("↗", t("openInGmail"), () => window.open(gmailUrl(group.account), "_blank"));
  head.append(avatar, title, count, open);
  section.append(head);

  if (group.loading) {
    section.append(el("div", "empty slim", t("loading")));
    return section;
  }

  if (group.error) {
    const box = el("div", "error-box slim", `${t("loadError")}: ${group.error}`);
    if (/403|insufficient|PERMISSION_DENIED/i.test(group.error)) {
      const retry = el("button", "accent-btn", t("reauthNeeded"));
      retry.type = "button";
      retry.addEventListener("click", () => void addAccount());
      box.append(el("div"), retry);
    }
    section.append(box);
    return section;
  }

  if (group.items.length === 0) {
    section.append(el("div", "empty slim", t("noMail")));
    return section;
  }

  const ul = el("ul", "mail-list");
  for (const row of group.items) ul.append(renderRow(row));
  section.append(ul);
  return section;
}

function renderRow(row: Row): HTMLLIElement {
  const li = el("li", row.unread ? "mail-row unread" : "mail-row");

  const top = el("div", "row-top");
  top.append(el("span", "row-from", row.fromName || row.from), el("span", "row-date", fmtDate(row.date)));

  const subj = el("div", "row-subject", row.subject);
  const snip = el("div", "row-snippet", row.snippet);

  const quick = el("div", "row-actions");
  quick.append(
    iconButton(row.unread ? "✉" : "✓", row.unread ? t("markRead") : t("markUnread"), () => void toggleRead(row)),
    iconButton("📦", t("archive"), () => void archiveRow(row)),
    iconButton("🗑", t("trash"), () => void trashRow(row)),
  );

  const main = el("div", "row-main");
  main.append(top, subj, snip);
  main.addEventListener("click", () => void openMessage(row));
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
  bar.append(
    iconButton("←", t("back"), () => {
      closeReader();
    }),
  );
  if (S.selected) {
    bar.append(
      iconButton("✓", t("markUnread"), () => {
        const sel = S.selected;
        const acc = accountById(sel?.accountId);
        if (sel && acc) {
          sel.unread = true;
          void markRead(acc, [sel.id], false).then(() => {
            renderSections();
            notifyBackground("refresh");
          });
        }
        closeReader();
      }),
      iconButton("📦", t("archive"), () => {
        if (S.selected) void archiveRow(S.selected);
      }),
      iconButton("🗑", t("trash"), () => {
        if (S.selected) void trashRow(S.selected);
      }),
    );
  }
  const acc = accountById(S.selectedAccountId);
  if (acc) {
    bar.append(iconButton("↗", t("openInGmail"), () => window.open(gmailUrl(acc, "view=om"), "_blank")));
  }
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
    frameBox.append(el("pre", "mail-text", S.body.text ?? ""));
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
