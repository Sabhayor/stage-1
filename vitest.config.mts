import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // Mirror the `@/*` path alias declared in tsconfig.json.
    alias: {
      "@": path.resolve(process.cwd()),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    setupFiles: ["tests/setup.ts"],
    // PGlite boots a WASM Postgres instance, which needs a little headroom.
    hookTimeout: 60_000,
    testTimeout: 30_000,
    restoreMocks: true,
  },
});
