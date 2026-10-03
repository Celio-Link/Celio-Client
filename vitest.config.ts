import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    setupFiles: ["./tests/scripts/serverStartAndTearDown.ts"],
    maxConcurrency: 1,
    // Every test file starts its own server on the same port, so files must not run in parallel
    fileParallelism: false
  }
});
