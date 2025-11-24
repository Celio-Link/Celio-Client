import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globalSetup: ["./tests/scripts/test-global-setup.ts"]
  }
});
