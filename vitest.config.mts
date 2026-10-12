import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: [
      "application/**/*.test.{ts,tsx}",
      "caching-fetch-library/**/*.test.{ts,tsx}",
    ],
    environment: "node",
    // Tests must be deterministic: no retries to mask flakiness, no real network.
    retry: 0,
    restoreMocks: true,
  },
});
