/** Shared domain types. */

export type ThemeMode = "system" | "light" | "dark";
export type Accent = "blue" | "green" | "purple";

export interface OAuthClient {
  /** Required on Firefox (redirects to https://xxx.extensions.allizom.org/). */
  redirectUrl?: string;
  clientSecret?: string;
  /** Optional override; defaults to the app's own client ID baked in at build time. */
  clientId?: string;
}

export interface AccountConfig {
  id: string;
  label: string;
  email: string;
  addedAt: number;
}

/** Persisted per-account auth material. */
export interface AccountSecret {
  refreshToken?: string;
  /** Per-account client override (BYO-client users); empty for built-in clients. */
  clientId?: string;
}

export interface AccountState {
  accountId: string;
  email: string;
  accessToken?: string;
  expiresAt?: number;
  historyId?: string;
  unreadCount?: number;
  error?: string;
}

export interface Settings {
  themeMode: ThemeMode;
  accent: Accent;
  pollSeconds: number;
  badgeEnabled: boolean;
  pageSize: number;
  clients: Record<string, OAuthClient>;
  lastAccount: string | null;
}

/* ---------- Gmail API shapes (subset we consume) ---------- */

export interface GmailProfile {
  emailAddress: string;
  historyId: string;
}

export interface GmailLabel {
  id: string;
  name: string;
  messageListVisibility?: string;
  unreadCount?: number;
  threadsUnread?: number;
}

export interface GmailHeader {
  name: string;
  value: string;
}

export interface GmailPart {
  partId?: string;
  mimeType?: string;
  filename?: string;
  headers?: GmailHeader[];
  body?: GmailBody;
  parts?: GmailPart[];
}

export interface GmailBody {
  size?: number;
  data?: string;
  attachmentId?: string;
}

export interface GmailMessage {
  id: string;
  threadId?: string;
  labelIds?: string[];
  snippet?: string;
  internalDate?: string;
  payload?: GmailPart;
  historyId?: string;
}

export interface MessageSummary {
  id: string;
  threadId: string;
  from: string;
  fromName: string;
  to: string;
  subject: string;
  date: number;
  snippet: string;
  labelIds: string[];
  unread: boolean;
}
