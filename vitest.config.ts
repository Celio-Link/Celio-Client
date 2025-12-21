import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    setupFiles: ["./tests/scripts/serverStartAndTearDown.ts"],
    maxConcurrency: 1
  }
});
