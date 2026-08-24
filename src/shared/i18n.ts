/** Tiny i18n dictionary. UI language follows the browser, ja/en supported. */
const DICT = {
  signInWithGoogle: { ja: "Google でサインイン", en: "Sign in with Google" },
  tagline: {
    ja: "複数のGmailアカウントをまとめてチェック。既読・削除もここから。",
    en: "Check multiple Gmail accounts at once. Read, mark and trash from here.",
  },
  authInProgress: { ja: "サインイン中…", en: "Signing in…" },
  openSettings: { ja: "設定を開く", en: "Open settings" },
  builtinClient: {
    ja: "組み込みのGoogleサインインが有効です。設定は不要です。",
    en: "Built-in Google sign-in is active. No setup needed.",
  },
  noBuiltinClient: {
    ja: "このビルドには組み込みサインインがありません。下段に自分のOAuthクライアントIDを入力してください。",
    en: "This build has no built-in sign-in. Enter your own OAuth client ID below.",
  },
  copy: { ja: "コピー", en: "Copy" },
  copied: { ja: "コピーしました", en: "Copied" },
  noBuiltinBuild: {
    ja: "このビルドには組み込みサインインがありません。設定ページからクライアントIDを入力してください。",
    en: "This build has no built-in sign-in. Enter your client ID in the options page.",
  },
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
