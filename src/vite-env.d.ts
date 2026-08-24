/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Default OAuth client ID baked at build time (optional). */
  readonly EASY_MAIL_CLIENT_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
