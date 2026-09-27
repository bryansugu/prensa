import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { readFileSync } from "node:fs";
import path from "node:path";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

const pkg = JSON.parse(readFileSync(path.join(import.meta.dirname, "package.json"), "utf8")) as { version: string };

export default defineConfig({
  plugins: [
    tanstackRouter({ target: "react", autoCodeSplitting: true }),
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg", "icon-64.png", "fonts/PPNeueMontreal-wght.woff2"],
      manifest: {
        name: "Prensa · Compresor PDF",
        short_name: "Prensa",
        description: "Comprime PDF con la mejor calidad, sin subir nada: el motor corre en tu dispositivo.",
        lang: "es",
        start_url: "/",
        display: "standalone",
        background_color: "#fcfcfd",
        theme_color: "#00922e",
        icons: [
          { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        // El motor WASM (~10 MB) también se precachea: la app funciona sin conexión.
        globPatterns: ["**/*.{js,css,html,wasm,woff2,svg,png}"],
        maximumFileSizeToCacheInBytes: 24 * 1024 * 1024,
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/api\//, /^\/cdn-cgi\//],
        cleanupOutdatedCaches: true,
      },
    }),
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
