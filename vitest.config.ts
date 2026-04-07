import { defineConfig } from "vite-plus";
import solid from "vite-plugin-solid";
import path from "path";

export default defineConfig({
  plugins: [
    solid({
      extensions: [".tsx", ".ts", ".jsx", ".js"],
      ssr: false,
    }),
  ],
  resolve: {
    alias: {
      "~": path.resolve(__dirname, "./src"),
    },
    conditions: ["browser", "development"],
    extensions: [".ts", ".tsx", ".js", ".jsx", ".json"],
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["vitest-setup.ts"],
    maxWorkers: 2,
    isolate: false,
    pool: "forks",
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "**/.{idea,git,cache,output,temp}/**",
      "**/{e2e,tests-e2e}/**",
    ],
    deps: {
      inline: [/solid-js/, /@solidjs\/router/],
    },
  },
});
