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
export default defineConfig({
  extensions: ["mdx", "md"],
  vite: {
    resolve: { alias: { "~backend-bindings": bindings } },
    plugins: [
      tailwindcss(),
      mdx.withImports({})({
        jsx: true,
        jsxImportSource: "solid-js",
        providerImportSource: "solid-mdx",
      }),
    ],
  },
});
