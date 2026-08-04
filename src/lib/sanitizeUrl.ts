const SAFE_URL_PATTERN = /^(?:https?:\/\/|\/(?:[\w]|$)|#)/i;
const BREAK_CHARS = /['"()\\]/;

/**
 * A URL string that has cleared the sanitize boundary. The only two minters are
 * `sanitizeUrl` (checks untrusted runtime input) and `trustedUrl` (a developer's
 * promise about a constant). Consumers require `SafeUrl`, so a raw string can't
 * reach a URL sink without passing one of them (see ADR-0006).
 */
export type SafeUrl = string & { readonly __brand: "SafeUrl" };

export function sanitizeUrl(url: string): SafeUrl | undefined {
  if (!SAFE_URL_PATTERN.test(url) || BREAK_CHARS.test(url)) {
    console.warn(`[sanitizeUrl] Blocked unsafe URL: ${url}`);
    return undefined;
  }
  return url as SafeUrl;
}

/**
 * Mint a `SafeUrl` from a developer-authored constant without checking it — a
 * promise, not a validation. Never pass runtime/user input here; use
 * `sanitizeUrl` for that. Greppable so a reviewer can spot a misuse at a glance.
 */
export function trustedUrl(url: string): SafeUrl {
  return url as SafeUrl;
}
