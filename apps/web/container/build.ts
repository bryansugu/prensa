/** Empaqueta el runner del contenedor (y sus .wasm) en container/dist con esbuild. */
import { build } from "esbuild";
import { copyFileSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const root = path.resolve(import.meta.dirname);
const dist = path.join(root, "dist");
const require = createRequire(import.meta.url);

rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });

await build({
  entryPoints: [path.join(root, "src/runner.ts")],
  outfile: path.join(dist, "runner.mjs"),
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node24",
  sourcemap: false,
  minify: false,
  legalComments: "none",
  logLevel: "info",
  banner: {
    js: 'import { createRequire as __prensaCreateRequire } from "node:module"; const require = __prensaCreateRequire(import.meta.url);',
  },
});

// mupdf no exporta el .wasm en "exports": se localiza junto a su entrada principal.
const mupdfWasm = path.join(path.dirname(require.resolve("mupdf")), "mupdf-wasm.wasm");
for (const [src, name] of [
  [mupdfWasm, "mupdf-wasm.wasm"],
  [require.resolve("@jsquash/jpeg/codec/enc/mozjpeg_enc.wasm"), "mozjpeg_enc.wasm"],
  [require.resolve("@jsquash/resize/lib/resize/pkg/squoosh_resize_bg.wasm"), "squoosh_resize_bg.wasm"],
] as const) {
  copyFileSync(src, path.join(dist, name));
}
writeFileSync(path.join(dist, "package.json"), JSON.stringify({ name: "prensa-engine-runner", private: true, type: "module" }, null, 2));
console.log(`runner empaquetado en ${dist}`);
