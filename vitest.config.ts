import { defineConfig } from "vitest/config";
import solid from "vite-plugin-solid";
import solidPlugin from 'vite-plugin-solid'

export default defineConfig({
  plugins: [solid(), solidPlugin()],
  resolve: {
    conditions: ["development", "browser"],
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['vitest-setup.ts'],
  },
});
