import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    // Pinned to 5173: the Twenty OAuth client's registered redirect URI is
    // http://localhost:5173/callback (see TWENTY_OAUTH_REDIRECT_URI and
    // docs/identity.md). strictPort fails loudly instead of silently
    // hopping to 5174+, where Twenty's return trip would 404/refuse.
    port: 5173,
    strictPort: true,
    host: true,
    proxy: {
      "/api": {
        target: "http://localhost:4000",
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: "dist",
    sourcemap: false,
  },
});
