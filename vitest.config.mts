import { defineConfig } from "vitest/config";

// Pure modules only (src/lib); components need a DOM and are not covered here.
export default defineConfig({
  test: {
    include: ["src/lib/__tests__/**/*.test.ts"],
    setupFiles: ["./src/lib/__tests__/tz.ts"],
  },
});
