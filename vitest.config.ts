import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      // See worker/test/cloudflareWorkersShim.ts.
      "cloudflare:workers": path.resolve(import.meta.dirname, "worker/test/cloudflareWorkersShim.ts"),
    },
  },
  test: {
    environment: "node",
    globals: true,
    include: ["shared/**/*.test.ts", "worker/**/*.test.ts", "src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      // Tout src/ (logique, vues et composants DOM sous jsdom) : chaque
      // fichier de test déclare son environnement via `@vitest-environment`.
      include: ["shared/**/*.ts", "worker/**/*.ts", "src/**/*.ts"],
      exclude: [
        "**/*.test.ts",
        "worker/test/**",
        // Type-only file (interfaces + one trivial re-exported constant),
        // nothing meaningful to unit-test.
        "shared/types.ts",
        // The Durable Object's own glue (storage, WebSocket hibernation) —
        // deliberately not unit-tested (would need a real Workers runtime
        // to be meaningful); exercised instead by the Playwright e2e suite
        // against a live `vite dev` instance. All of its actual logic lives
        // in reducer.ts, which is fully unit-tested.
        "worker/listRoom.ts",
      ],
      thresholds: {
        lines: 100,
        branches: 100,
        functions: 100,
        statements: 100,
      },
    },
  },
});
