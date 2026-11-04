// @refresh reload
import { createHandler, StartServer } from "@solidjs/start/server";
import { getRequestEvent } from "solid-js/web";
import { themeCookie, themeFromCookies } from "~/lib/theme";

export default createHandler(() => (
  <StartServer
    document={({ assets, children, scripts }) => {
      // The server renders the saved theme, so the first paint is right with no
      // script. System Theme renders no data-theme, and CSS follows the device
      // (ADR-0033).
      const event = getRequestEvent();
      const theme = themeFromCookies(event?.request.headers.get("cookie"));
      // Each full page load renews a valid cookie, so the saved theme lasts one
      // year after the last load. The page streams, and the headers go out with
      // the first byte. The document function runs before it; code after a
      // Suspense boundary resolves is too late for a header.
      if (theme) event?.response.headers.append("Set-Cookie", themeCookie(theme));
      return (
        <html lang="en" data-theme={theme === "system" ? undefined : theme}>
          <head>
            <meta charset="utf-8" />
            <meta name="viewport" content="width=device-width, initial-scale=1" />
            <link rel="icon" href="/favicon.ico" />
            {assets}
          </head>
          <body>
            <div id="app">{children}</div>
            {scripts}
          </body>
        </html>
      );
    }}
  />
));
