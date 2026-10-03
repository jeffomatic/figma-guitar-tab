import { defineConfig } from "vitest/config";

// Tests import { describe, it, expect } from "vitest" explicitly rather than
// relying on globals, so no tsconfig needs a `types` entry for them.
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
