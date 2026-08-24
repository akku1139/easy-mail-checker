/**
 * Build-time constants injected by Vite `define`.
 * __TARGET__ is "firefox" (MV2 build) or "chrome" (MV3 build).
 */
declare const __TARGET__: "firefox" | "chrome";
declare const __BUILD__: string;

/** Runtime namespace: `browser` on Firefox, `chrome` everywhere else. */
export const api = (__TARGET__ === "firefox" ? globalThis.browser : globalThis.chrome) as typeof browser;
export const TARGET = __TARGET__;
export const IS_FIREFOX = __TARGET__ === "firefox";
export const BUILD_ID = __BUILD__;

export function assertNever(x: never): never {
  throw new Error("unreachable: " + String(x));
}
