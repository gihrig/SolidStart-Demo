const SAFE_URL_PATTERN = /^(?:https?:\/\/|\/(?:[\w]|$)|#)/i;
const BREAK_CHARS = /['"()\\]/;

export function sanitizeUrl(url: string): string | undefined {
  if (!SAFE_URL_PATTERN.test(url) || BREAK_CHARS.test(url)) {
    console.warn(`[sanitizeUrl] Blocked unsafe URL: ${url}`);
    return undefined;
  }
  return url;
}
