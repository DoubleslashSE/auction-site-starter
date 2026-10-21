import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// The site is static files: build it and serve dist/ from any web server, with public/config.js replaced by your house's
// settings (README "Deploy"). In development `pnpm dev` serves it at http://localhost:5190.
export default defineConfig({
  plugins: [react()],
  server: { port: 5190, strictPort: true },
  preview: { port: 5190, strictPort: true },
  build: { sourcemap: true },
  test: { include: ["tests/**/*.test.ts"] },
});
