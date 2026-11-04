import { getRequestEvent } from "solid-js/web";

export const THEMES = ["system", "light", "dark"] as const;

const COOKIE_NAME = "theme";
// The same in every environment, so not from `.env` (ADR-0033). One year.
const COOKIE_ATTRIBUTES = "Max-Age=31536000; Path=/; HttpOnly; Secure; SameSite=Lax";

/** The light or dark look of the site. System Theme follows the device (ADR-0033). */
export type Theme = (typeof THEMES)[number];

function isTheme(value: unknown): value is Theme {
  return THEMES.includes(value as Theme);
}

/** A value outside `THEMES` is System Theme. */
export function parseTheme(value: string | null | undefined): Theme {
  return isTheme(value) ? value : "system";
}

/** The saved theme in a `Cookie` header, or `undefined` if it is missing or bad. */
export function themeFromCookies(header: string | null | undefined): Theme | undefined {
  for (const pair of header?.split(";") ?? []) {
    const at = pair.indexOf("=");
    if (at < 0 || pair.slice(0, at).trim() !== COOKIE_NAME) continue;
    const value = pair.slice(at + 1).trim();
    return isTheme(value) ? value : undefined;
  }
  return undefined;
}

/** The `Set-Cookie` value that saves a Theme. */
export function themeCookie(theme: Theme): string {
  return `${COOKIE_NAME}=${theme}; ${COOKIE_ATTRIBUTES}`;
}

// A server function also takes a form post from another site, and `SameSite=Lax`
// does not stop a form on another port of the same host. Only `same-origin`
// passes; a request with no `Sec-Fetch-Site` fails (ADR-0033).
export function isSameOrigin(headers: Headers): boolean {
  return headers.get("Sec-Fetch-Site") === "same-origin";
}

/**
 * Saves a choice in the cookie. A page script cannot write an HttpOnly cookie,
 * so the browser calls this server function. The value comes off the network,
 * so it is checked again here.
 */
export async function saveTheme(theme: Theme): Promise<void> {
  "use server";
  const event = getRequestEvent();
  if (!event || !isSameOrigin(event.request.headers)) {
    throw new Error("saveTheme: not a same-origin request");
  }
  if (!isTheme(theme)) throw new Error("saveTheme: not a Theme");
  event.response.headers.append("Set-Cookie", themeCookie(theme));
}
