/**
 * Default OAuth client used when the user has not supplied per-account
 * credentials in the options page. Replace via env vars at build time:
 *   EASY_MAIL_CLIENT_ID=... pnpm build
 */
export const DEFAULT_CLIENT_ID: string = import.meta.env?.EASY_MAIL_CLIENT_ID ?? "";
export const CLIENT_ID_SOURCE: "builtin" | "user" =
  DEFAULT_CLIENT_ID ? "builtin" : "user";
