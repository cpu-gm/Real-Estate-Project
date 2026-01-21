import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    setupFiles: ["./test/setup.ts"],
    threads: false,
    fileParallelism: false,
    testTimeout: 20000,
    hookTimeout: 20000
  }
});
