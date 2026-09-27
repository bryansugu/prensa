# CLAUDE.md — Prensa

Compresor PDF profesional, local-first, con el sistema de diseño Polen. Plan completo en
`docs/PLAN.md`. Lee `docs/ARCHITECTURE.md` antes de tocar el motor.

## Comandos (Node 24 · pnpm 12 — `nvm use`)

```bash
pnpm install            # deps (los builds de esbuild/workerd están permitidos en pnpm-workspace.yaml)
pnpm ds:sync            # sincroniza Polen desde https://polen.cdc.cool/r → apps/web/src/components/ds
pnpm dev                # Vite + Worker local (http://localhost:5173)
pnpm test               # vitest en todos los workspaces (motor: PDFs sintéticos con MuPDF)
pnpm typecheck          # tsc por workspace (apps/web genera worker-configuration.d.ts con `pnpm -F @prensa/web cf:types`)
pnpm lint               # eslint (type-aware)
pnpm bench              # benchmark del motor sobre tools/bench/corpus
pnpm deploy             # vite build + wrangler deploy (SPA + API en un Worker)
```

Un solo test: `pnpm --filter @prensa/engine exec vitest run test/engine.test.ts -t "paleta"`.

## Estructura

- `packages/schema` — contratos zod compartidos (CompressionSpec, AnalysisReport, presets, JobState).
- `packages/engine` — motor: análisis + compresión con MuPDF.js (WASM) + mozjpeg. Corre en Web Worker
  (`src/worker`) y en Node (`src/node.ts`, usado por tests/bench/nube).
- `apps/web` — Vite + React 19 + Tailwind 4 + Polen. `worker/` es el Cloudflare Worker (Hono) que sirve la
  SPA y la API. `src/components/ds/**` y `src/styles/tokens.css` son GENERADOS por `pnpm ds:sync`: no editar.
- `apps/engine-cloud` — contenedor (Fase 3) con Ghostscript/ocrmypdf/jbig2enc.
- `tools/polen-sync.ts`, `tools/bench/`.

## Reglas del motor

- Nunca reescribir el documento (no Ghostscript pdfwrite) en modo `preserve`: las imágenes se
  reemplazan in-place con `PDFObject.writeRawStream` para que enlaces/formularios/etiquetas queden intactos.
- Cada imagen recomprimida se verifica con SSIM contra la referencia; si no alcanza el mínimo del preset,
  sube la calidad. Solo se reemplaza si ahorra ≥ 3 %.
- El resultado nunca es más grande que la entrada (se devuelve el original con explicación).
- Recursos WASM de MuPDF se destruyen explícitamente (`destroy()`); no hay GC.

## Diseño

- Solo tokens/componentes de Polen (`@/components/ds/*`). Utilidades Tailwind vía `src/styles/theme.css`.
- Íconos: `components/ds/icons.tsx` (grilla 20×20, stroke 1.667). No mezclar librerías de íconos.
- Dark mode con `data-theme` en `<html>`; textos en español.
