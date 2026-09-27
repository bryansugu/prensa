import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { readFileSync } from "node:fs";
import path from "node:path";
import { defineConfig } from "vite";

const pkg = JSON.parse(readFileSync(path.join(import.meta.dirname, "package.json"), "utf8")) as { version: string };

export default defineConfig({
  plugins: [
    tanstackRouter({ target: "react", autoCodeSplitting: true }),
    react(),
    tailwindcss(),
    cloudflare(),
  ],
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname, "src") },
  },
  // Los paquetes WASM localizan su binario con import.meta.url; pre-bundlearlos rompe la ruta.
  optimizeDeps: {
    exclude: ["mupdf", "@jsquash/jpeg", "@jsquash/resize"],
  },
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  worker: { format: "es" },
  build: {
    target: "es2022",
    sourcemap: true,
  },
});
