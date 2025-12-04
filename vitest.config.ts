import { defineConfig } from "vitest/config";
import solid from "vite-plugin-solid";

export default defineConfig({
  plugins: [
    solid({
      extensions: ['.tsx', '.ts', '.jsx', '.js'],
      ssr: false,
    }),
  ],
  resolve: {
    conditions: ["browser", "development"],
    extensions: ['.ts', '.tsx', '.js', '.jsx', '.json'],
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['vitest-setup.ts'],
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
    deps: {
      inline: [/solid-js/, /@solidjs\/router/],
    },
  },
});
