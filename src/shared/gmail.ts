import { getAccessToken } from "./auth";
import type {
  AccountConfig,
  AccountState,
  GmailMessage,
  GmailProfile,
  MessageSummary,
} from "./types";

const BASE = "https://gmail.googleapis.com/gmail/v1/users/me";

export class GmailApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "GmailApiError";
  }
}

function qs(params: Record<string, string | number | undefined>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== "") sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}

async function call<T>(
  account: Pick<AccountConfig, "id" | "email">,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const token = await getAccessToken(account as AccountConfig);
  const res = await fetch(BASE + path, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...(init.headers ?? {}) },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new GmailApiError(res.status, `Gmail API ${res.status}: ${text.slice(0, 300)}`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/* --------------------------------- read --------------------------------- */

export async function getProfile(account: Pick<AccountConfig, "id" | "email">): Promise<GmailProfile> {
  return call<GmailProfile>(account, "/profile");
}

/** Unread count via the UNREAD label counters (cheap, no message scan). */
export async function getUnreadCount(account: Pick<AccountConfig, "id" | "email">): Promise<number> {
  const label = await call<{ messagesUnread?: number }>(account, "/labels/UNREAD");
  return label.messagesUnread ?? 0;
}

export interface MessageListPage {
  messages: { id: string; threadId: string }[];
  nextPageToken?: string;
  resultSizeEstimate: number;
}

export async function listMessageIds(
  account: Pick<AccountConfig, "id" | "email">,
  opts: { q?: string; labelIds?: string[]; maxResults?: number; pageToken?: string } = {},
): Promise<MessageListPage> {
  // labelIds is a repeatable query parameter: ?labelIds=INBOX&labelIds=UNREAD
  let path = `/messages${qs({
    q: opts.q,
    pageToken: opts.pageToken,
    maxResults: opts.maxResults ?? 25,
  })}`;
  for (const l of opts.labelIds ?? []) {
    path += `${path.includes("?") ? "&" : "?"}labelIds=${encodeURIComponent(l)}`;
  }
  return call<MessageListPage>(account, path);
}

export async function getMessageRaw(
  account: Pick<AccountConfig, "id" | "email">,
  id: string,
  format: "full" | "metadata" = "full",
): Promise<GmailMessage> {
  return call<GmailMessage>(account, `/messages/${encodeURIComponent(id)}${qs({ format })}`);
}

/* ------------------------------ summarizing ----------------------------- */

function findHeader(msg: GmailMessage, name: string): string {
  const hit = msg.payload?.headers?.find((h) => h.name.toLowerCase() === name.toLowerCase());
  return hit?.value ?? "";
}

export function splitAddress(value: string): { name: string; address: string } {
  const m = value.match(/^\s*"?([^"<]*)"?\s*<([^>]+)>\s*$/);
  if (m) return { name: (m[1] || m[2] || "").trim(), address: (m[2] ?? "").trim() };
  return { name: value.trim(), address: value.trim() };
}

export function toSummary(msg: GmailMessage): MessageSummary {
  const from = splitAddress(findHeader(msg, "From"));
  return {
    id: msg.id,
    threadId: msg.threadId ?? msg.id,
    from: from.address,
    fromName: from.name,
    to: findHeader(msg, "To"),
    subject: findHeader(msg, "Subject") || "(no subject)",
    date: Number(msg.internalDate ?? Date.now()),
    snippet: msg.snippet ?? "",
    labelIds: msg.labelIds ?? [],
    unread: (msg.labelIds ?? []).includes("UNREAD"),
  };
}

/** List + hydrate summaries (metadata format keeps payloads small). */
export async function listSummaries(
  account: Pick<AccountConfig, "id" | "email">,
  opts: { q?: string; labelIds?: string[]; maxResults?: number; pageToken?: string } = {},
): Promise<MessageListPage & { items: MessageSummary[] }> {
  const page = await listMessageIds(account, opts);
  const ids = (page.messages ?? []).map((m) => m.id);
  const items: MessageSummary[] = [];
  // Hydrate in small batches (no batch endpoint exists; stay polite to the API).
  const BATCH = 10;
  for (let i = 0; i < ids.length; i += BATCH) {
    const chunk = ids.slice(i, i + BATCH);
    const summaries = await Promise.all(
      chunk.map((id) => getMessageRaw(account, id, "metadata").then(toSummary)),
    );
    items.push(...summaries);
  }
  return { ...page, messages: page.messages ?? [], items };
}

/* --------------------------------- bodies -------------------------------- */

function decodeB64Url(data: string): string {
  const b64 = data.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64.padEnd(Math.ceil(b64.length / 4) * 4, "="));
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder("utf-8").decode(bytes);
}

interface BodyResult {
  html?: string;
  text?: string;
}

function collectParts(part: NonNullable<GmailMessage["payload"]>, out: BodyResult): void {
  const mime = part.mimeType ?? "";
  const data = part.body?.data;
  if ((mime === "text/plain" || mime === "text/html") && data) {
    const decoded = decodeB64Url(data);
    if (mime === "text/plain") out.text ??= decoded;
    else out.html ??= decoded;
  }
  for (const child of part.parts ?? []) collectParts(child, out);
}

export interface RenderedMail {
  summary: MessageSummary;
  html: string | null;
  text: string | null;
  attachments: { filename: string; size: number }[];
}

export async function readMail(
  account: Pick<AccountConfig, "id" | "email">,
  id: string,
): Promise<RenderedMail> {
  const raw = await getMessageRaw(account, id, "full");
  const out: BodyResult = {};
  if (raw.payload) collectParts(raw.payload, out);
  const attachments = (raw.payload?.parts ?? [])
    .filter((p) => p.filename)
    .map((p) => ({ filename: p.filename!, size: p.body?.size ?? 0 }));
  return { summary: toSummary(raw), html: out.html ?? null, text: out.text ?? null, attachments };
}

/* -------------------------------- actions ------------------------------- */

export async function markRead(
  account: Pick<AccountConfig, "id" | "email">,
  ids: string[],
  read: boolean,
): Promise<void> {
  await Promise.all(
    ids.map((id) =>
      call(account, `/messages/${encodeURIComponent(id)}/modify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(read ? { removeLabelIds: ["UNREAD"] } : { addLabelIds: ["UNREAD"] }),
      }),
    ),
  );
}

export async function moveToTrash(
  account: Pick<AccountConfig, "id" | "email">,
  ids: string[],
): Promise<void> {
  await Promise.all(ids.map((id) => call(account, `/messages/${encodeURIComponent(id)}/trash`, { method: "POST" })));
}

export async function deleteForever(
  account: Pick<AccountConfig, "id" | "email">,
  ids: string[],
): Promise<void> {
  await Promise.all(ids.map((id) => call(account, `/messages/${encodeURIComponent(id)}`, { method: "DELETE" })));
}

export async function archiveMessages(
  account: Pick<AccountConfig, "id" | "email">,
  ids: string[],
): Promise<void> {
  await Promise.all(
    ids.map((id) =>
      call(account, `/messages/${encodeURIComponent(id)}/modify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ removeLabelIds: ["INBOX"] }),
      }),
    ),
  );
}

/* -------------------------------- account ------------------------------- */

/** Refresh profile + unread state; used by background polling and popup open. */
export async function refreshAccountState(account: AccountConfig, prev?: AccountState): Promise<AccountState> {
  const [profile, unread] = await Promise.all([getProfile(account), getUnreadCount(account)]);
  return {
    ...(prev ?? { accountId: account.id, email: account.email }),
    accountId: account.id,
    email: profile.emailAddress || account.email,
    historyId: profile.historyId,
    unreadCount: unread,
    error: undefined,
  };
}
