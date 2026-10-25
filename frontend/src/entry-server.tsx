// @refresh reload
import { createHandler, StartServer } from "@solidjs/start/server";
import { getRequestEvent } from "solid-js/web";
import { themeFromCookies } from "~/lib/theme";

export default createHandler(() => (
  <StartServer
    document={({ assets, children, scripts }) => {
      // The server renders the saved theme, so the first paint is right with no
      // script. System Theme renders no data-theme, and CSS follows the device
      // (ADR-0033).
      const theme = themeFromCookies(getRequestEvent()?.request.headers.get("cookie"));
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
