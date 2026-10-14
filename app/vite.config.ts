import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

// Served at portal.tipolo.ca. The previous portal lives on at /legacy/ for the screens
// that haven't been rebuilt yet.
export default defineConfig({
  base: "/",
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      // One config for both apps: the public Supabase and Google values live in the
      // repo's config.js, which the current portal already reads.
      "@portal-config": path.resolve(import.meta.dirname, "../config.js"),
      // The previous portal's framework-free code: the printed documents (letterhead,
      // proposals, invoices), template content, tokens and the PDF reader. Shared rather
      // than copied, so a proposal prints the same from either version.
      "@site": path.resolve(import.meta.dirname, ".."),
    },
  },
  server: { port: 5173, fs: { allow: [".."] } },
});
