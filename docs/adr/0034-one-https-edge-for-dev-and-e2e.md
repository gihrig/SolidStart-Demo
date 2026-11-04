# One HTTPS edge serves dev and e2e, as in production

#200 sets a `Secure` theme cookie in every environment. WebKit 26.6 drops a `Secure`
cookie that `http://localhost` sets (#233). Production ends TLS before the app:
Cloudflare ends it, an edge Caddy forwards plain HTTP, and one container runs the
front-end and the back-end.

## Decisions

**One Caddy edge ends TLS in dev and e2e.** The edge listens at
`https://localhost:3443`. The front-end (`:3000`) and the back-end (`:8080`) stay
plain HTTP.

**The edge routes by path, so the browser sees one origin.** `/api/*` and `/ws` go
to the back-end. All other paths go to the front-end. The production edge needs
the same rules.

**The browser uses relative URLs, and SSR calls the back-end directly.**
`BACKEND_URL` is `""` in the browser and `http://localhost:8080` on the server. The
WebSocket URL comes from `location`, so an `https:` page uses `wss:`. Env config
comes with #19.

**Caddy is pinned and verified.** `scripts/caddy.sh` downloads Caddy v2.11.7 into
`/.tools/`. It checks the SHA-512 before it runs Caddy. CI runs the same script.

**Caddy's local CA stays in the repo folder.** The CA lives in the git-ignored
`/.caddy/` folder. Caddy changes the system trust store only when you run
`cgs caddy:trust`. Playwright uses `ignoreHTTPSErrors: true`.

**The back-end has no CORS layer.** No caller from another origin remains.

## Considered and rejected

- **TLS in each server** (vinxi `server.https`, Nitro `NITRO_SSL_CERT`, `axum-server`
  with rustls, mkcert). Rejected: production never runs TLS in the container. It
  adds ISC to `deny.toml`, `NODE_EXTRA_CA_CERTS`, a mkcert binary with no checksum
  file, and dev-only code in the release binary.
- **No `Secure` on `http://localhost`.** Rejected: #200 gives the cookie the same
  attributes in every environment. A plain-HTTP `.local` replica would still fail.
- **The `caddy` Docker image.** Rejected: on macOS, the container reaches the host
  servers only through `host.docker.internal`.
- **Port 443.** Rejected: on Linux, a process needs root or `setcap` to bind it.

## Consequences

- `http://localhost:3000` alone cannot log in, because it serves no `/api`. Use
  the edge URL.
- Vite HMR runs through the edge: the client router's HMR socket uses port 24678,
  and the edge forwards `/_build/` upgrades to it.
- `cgs quick` still calls `http://localhost:8080` directly. It uses no browser.
- ADR-0015 says the auth cookie "rides the same-site `localhost:3000 → :8080`
  upgrade in dev". After this ADR, the upgrade is same-origin, through the edge.
- The production image (#19) holds no Caddy. The server1 edge holds the routing
  rules. The two copies of the rules can drift, so #19 tests the image behind a
  Caddy with the server1 rules.
