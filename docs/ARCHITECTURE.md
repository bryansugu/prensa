# Arquitectura — Prensa

Resumen operativo del motor y la app. El plan completo (fases, nube, benchmark) está en `PLAN.md`.

## Flujo local (navegador)

```
File → Web Worker (packages/engine/src/worker/engine.worker.ts, Comlink)
  open()      → MuPDF.js abre el PDF (contraseña opcional)
  analyze()   → analyze.ts: inventario de imágenes + DPI efectivo (Device.fillImage),
                fuentes, texto por página, interactividad, desglose de bytes, estimaciones
  compress()  → compress.ts:
                 1. bake() si se pide aplanar
                 2. analyze (sobre el doc a modificar)
                 3. images/process.ts por imagen (in-place, ver abajo)
                 4. pdf/cleanup.ts (conservar / eliminar)
                 5. saveToBuffer("garbage=deduplicate,compress,compress-fonts,compress-images,objstms,sanitize,encrypt=…")
                 6. subsetFonts() en copia, aceptado solo si el texto extraído es idéntico
                 7. pdf/verify.ts: páginas, texto, SSIM de página, anotaciones/formularios/marcadores
                 8. si falla la verificación o no ahorra → se devuelve el original con explicación
  renderPage()→ PNG para miniaturas / comparador
```

## Por imagen (`images/process.ts`)

1. Saltar: stencil masks, diminutas, color-key mask, SMaskInData.
2. Decodificar con MuPDF a RGBA (cualquier filtro: JPX, JBIG2, CCITT, ICC, Indexed…).
3. Clasificar sobre la imagen original (`classify.ts`): foto / gráfico / escaneo / bilevel.
4. Paleta exacta (≤256 colores) calculada antes de redimensionar (gráficos).
5. Redimensionar (Lanczos3) al DPI objetivo relativo al tamaño dibujado; si había paleta,
   re-mapear al color más cercano para que siga siendo exacta.
6. Candidatos: bilevel (Sauvola → 1 bpc, CCITT al guardar) · indexado/gris Flate · JPEG mozjpeg
   con verificación SSIM ≥ mínimo del preset (sube la calidad en pasos de 6 hasta 95).
7. Gana el más pequeño que supere el SSIM y ahorre ≥ 3 %. Se escribe con `writeRawStream` sobre
   la referencia indirecta y se actualiza el diccionario; la `/SMask` se redimensiona al mismo tamaño.

## Reglas duras de MuPDF.js 1.28.1

- No llamar `resolve()` sobre referencias a streams (el stream se pierde al guardar). `pdf/objects.ts`
  devuelve la referencia para streams; `get()`/`isStream()`/`read*Stream()`/`write*Stream()` resuelven solos.
- `isStream()`, `writeRawStream()`, `put()` van sobre la referencia indirecta.
- Opciones de guardado no soportadas por el build WASM: `compress-effort`, `linearize`.

## Datos compartidos

`packages/schema` (zod): `CompressionSpec` (preset + overrides + conservar/eliminar/aplanar + nube + salida),
`AnalysisReport`, `CompressionResult`, `ProgressEvent`, `JobState`. Presets en `PRESETS`.

## App

`apps/web`: Vite + React 19 + TanStack Router + Zustand. `features/compress/store.ts` orquesta el pool de
workers (`engine-pool.ts`, hasta 3 workers, un archivo vive en un worker). UI con componentes Polen
(`components/ds/**`, generados) + `theme.css` que expone tipografía/radius/sombras/easing como utilidades.
`worker/index.ts` es el Cloudflare Worker (Hono) que sirve la SPA y `/api/*` (la nube llega en Fase 3).

## Benchmark

`pnpm bench` (tools/bench/run.ts) corre presets sobre `tools/bench/corpus/*.pdf` y escribe
`tools/bench/out/report.md` con tamaño, ahorro, tiempo, SSIM de página, texto, interactividad y `qpdf --check`.
