# The saved theme lives in an HttpOnly cookie that the server renders

#200 moves the Theme choice into the Profile menu. Before #200, the saved theme lived
in `localStorage`. A blocking script, `public/theme-init.js`, applied it before the
first paint, and the server could not see it. The project rule: a choice that the
server renders goes in an HttpOnly, Secure cookie, not in `localStorage`.

## Decisions

**One cookie holds the saved theme.** The cookie is
`theme=<system|light|dark>; Max-Age=31536000; Path=/; HttpOnly; Secure; SameSite=Lax`.
The attributes are constants in the code, the same in every environment. The server
treats any other value as System Theme. A choice of System Theme writes
`theme=system`, so one code path writes all three values.

**The browser owns the saved theme, not the User.** A logged-out visitor can choose
a Theme. Login and logout do not change the saved theme. It does not follow a User to
another browser.

**The server renders the saved theme.** The document function in `entry-server.tsx`
reads the cookie. For Light Theme or Dark Theme, it renders `data-theme="light"` or
`data-theme="dark"` on `<html>`. For System Theme, it renders no `data-theme`, and
CSS follows the device setting. So the first paint is right with no script, and
`theme-init.js` goes.

**Each full page load renews the cookie.** If the cookie holds a valid value, the
document function sets it again with a new `Max-Age`. So the saved theme lasts one
year after the last page load. The page streams, so the header must go out before
the first byte. The document function runs before the first byte. Code that runs
after a `Suspense` boundary resolves is too late for a header.

**A server function saves a choice, after a same-origin check.** A page script cannot
write an HttpOnly cookie. So a choice calls a `"use server"` function, the first in
the project. The SolidStart handler takes the function id from the URL and parses
form bodies. So a form on any site can call a server function. `SameSite=Lax` does
not stop a form on another port of the same host. So the function writes the cookie
only when the request has `Sec-Fetch-Site: same-origin`. A request without that
header fails the check. A later server function that changes state needs the same
check.

**The page changes at once.** A choice applies the Theme before the server answers.
If the save fails, the page keeps the new Theme until the next page load, and no
alert shows. Saves run in click order, so the last choice becomes the saved theme.

## Considered and rejected

- **Keep `localStorage` and `theme-init.js`.** Rejected: the server cannot render the
  saved theme, and a blocking script must run before the first paint.
- **A cookie that a page script writes.** Rejected: such a cookie cannot be HttpOnly.
- **Delete the cookie for System Theme.** Rejected: it adds a second code path.
- **The saved theme on the User record.** Rejected: a logged-out visitor needs a
  saved theme too.
- **`SameSite` from an env file.** Rejected: only `Lax` is right for this cookie.
  With `Strict`, a page that a link on another site opens shows System Theme. Vite
  loads `.env.test` only in Vitest, and `vinxi start` loads no env file.
- **Accept `Sec-Fetch-Site: same-site`.** Rejected: a form on another port of the
  same host sends `same-site`, and the browser sends the `Lax` cookies with it.
- **No `Secure` on `http://localhost`.** Rejected: the cookie has the same attributes
  in every environment. Dev and e2e move to HTTPS instead (#233).
- **Only a choice sets the cookie.** Rejected: the saved theme would end one year after
  the last choice, also for a visitor who comes every day.

## Consequences

- Dev and e2e need HTTPS on both servers, which #233 adds. WebKit drops a `Secure`
  cookie that `http://localhost` sets.
- Each page response sets the cookie, and each page differs by the cookie. So a shared
  cache must not store pages (#19).
- A page load can undo a choice. If a page request leaves before a save response
  arrives, its response writes back the old value. The window is one server round
  trip. This risk is accepted.
- A browser that sends no `Sec-Fetch-Site` cannot save a choice: Chrome before 76,
  Firefox before 90 and Safari before 16.4. The page still changes until the next
  page load.
- The Profile menu needs JavaScript to open, so a visitor without JavaScript cannot
  choose a Theme (#34). The server still renders the saved theme.
- A theme saved in `localStorage` before #200 is ignored. The app has no deployment
  yet (#19), so no real visitor loses a choice.
- The **Theme** entry in `CONTEXT.md` links here.
