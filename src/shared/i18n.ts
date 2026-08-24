/** Tiny i18n dictionary. UI language follows the browser, ja/en supported. */
const DICT = {
  addAccount: { ja: "アカウントを追加", en: "Add account" },
  settings: { ja: "設定", en: "Settings" },
  refresh: { ja: "更新", en: "Refresh" },
  compose: { ja: "作成", en: "Compose" },
  inbox: { ja: "受信トレイ", en: "Inbox" },
  search: { ja: "検索", en: "Search" },
  markRead: { ja: "既読", en: "Mark read" },
  markUnread: { ja: "未読", en: "Mark unread" },
  archive: { ja: "アーカイブ", en: "Archive" },
  trash: { ja: "ゴミ箱へ", en: "Trash" },
  deleteForever: { ja: "完全に削除", en: "Delete forever" },
  back: { ja: "戻る", en: "Back" },
  openInGmail: { ja: "Gmailで開く", en: "Open in Gmail" },
  noMail: { ja: "メールはありません", en: "No mail" },
  loading: { ja: "読み込み中…", en: "Loading…" },
  theme: { ja: "テーマ", en: "Theme" },
  system: { ja: "システム", en: "System" },
  light: { ja: "ライト", en: "Light" },
  dark: { ja: "ダーク", en: "Dark" },
  accent: { ja: "アクセント色", en: "Accent color" },
  blue: { ja: "青", en: "Blue" },
  green: { ja: "緑", en: "Green" },
  purple: { ja: "紫", en: "Purple" },
  accounts: { ja: "アカウント", en: "Accounts" },
  removeAccount: { ja: "削除", en: "Remove" },
  signOut: { ja: "サインアウト", en: "Sign out" },
  pollInterval: { ja: "ポーリング間隔（秒）", en: "Poll interval (sec)" },
  badge: { ja: "バッジに未読数を表示", en: "Show unread badge" },
  pageSize: { ja: "1ページの表示件数", en: "Messages per page" },
  oauthClients: { ja: "OAuthクライアント", en: "OAuth clients" },
  clientId: { ja: "クライアントID", en: "Client ID" },
  clientSecret: { ja: "クライアントシークレット", en: "Client secret" },
  redirectUrl: { ja: "リダイレクトURL", en: "Redirect URL" },
  save: { ja: "保存", en: "Save" },
  saved: { ja: "保存しました", en: "Saved" },
  authError: { ja: "認証エラー", en: "Auth error" },
  loadError: { ja: "読み込みエラー", en: "Failed to load" },
  reauthNeeded: {
    ja: "再認証が必要です。アカウントを追加し直してください。",
    en: "Re-authorization required. Please re-add the account.",
  },
} as const;

export type MsgKey = keyof typeof DICT;

type BrowserLang =
  | string
  | undefined;

export function detectLang(): "ja" | "en" {
  const lang: BrowserLang =
    (globalThis as any).browser?.i18n?.getUILanguage?.() ??
    globalThis.chrome?.i18n?.getUILanguage?.() ??
    navigator.language;
  return lang?.toLowerCase().startsWith("ja") ? "ja" : "en";
}

let lang: "ja" | "en" | null = null;

export function t(key: MsgKey): string {
  if (lang === null) lang = detectLang();
  return DICT[key][lang];
}
