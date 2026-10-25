import { defineConfig } from "@solidjs/start/config";
/* @ts-ignore */
import pkg from "@vinxi/plugin-mdx";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";

const { default: mdx } = pkg;
// The ts-rs bindings (ADR-0010). Most are types only; `CommentHtmlPolicy.ts`
// is a runtime value (#126), so the bundler resolves the alias too.
const bindings = fileURLToPath(
  new URL("../backend/crates/services/web-server/bindings", import.meta.url),
);
// One set of plugin instances for every router, as with the earlier object form.
const plugins = [
  tailwindcss(),
  mdx.withImports({})({
    jsx: true,
    jsxImportSource: "solid-js",
    providerImportSource: "solid-mdx",
  }),
];
export default defineConfig({
  extensions: ["mdx", "md"],
  vite: ({ router }: { router: string }) => ({
    resolve: { alias: { "~backend-bindings": bindings } },
    plugins,
    // The browser reaches dev HMR through the HTTPS edge (ADR-0034, #233). vinxi
    // gives each router's HMR socket a random plain-ws port, which an https page
    // cannot open. So the client router's socket gets a fixed port, and the
    // browser dials the edge, which forwards /_build/ upgrades to it (/Caddyfile).
    ...(router === "client" ? { server: { hmr: { port: 24678, clientPort: 3443 } } } : {}),
  }),
});
