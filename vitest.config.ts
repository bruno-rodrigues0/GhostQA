import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const sourceDirectory = fileURLToPath(new URL("./src", import.meta.url));

export default defineConfig({
  esbuild: {
    jsx: "automatic",
  },
  resolve: {
    alias: {
      "@": sourceDirectory,
    },
  },
  test: {
    include: ["tests/**/*.test.{ts,tsx}"],
  },
});
