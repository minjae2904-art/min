import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Pure modules only (src/lib); components need a DOM and are not covered here.
// "@" -> src mirrors tsconfig paths (safety net: src/lib itself uses relative imports).
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    include: ["src/lib/__tests__/**/*.test.ts"],
    setupFiles: ["./src/lib/__tests__/tz.ts"],
  },
});
