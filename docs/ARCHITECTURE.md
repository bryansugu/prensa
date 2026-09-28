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
                 4. pdf/cleanup.ts (conservar / eliminar) + barrido de TODOS los objetos:
                    /PieceInfo, PTEX.*, LastModified fuera (Illustrator/pdfTeX cuelgan KBs de cada figura)
                 5. saveToBuffer("garbage=deduplicate,compress,compress-fonts,compress-images,objstms,encrypt=…")
                    — sin `sanitize`: reescribe content streams y altera el texto extraíble en PDFs de InDesign
                 6. subsetFonts() en copia, aceptado solo si el texto extraído es idéntico
                 7. pdf/verify.ts: páginas, texto, SSIM de página, anotaciones/formularios/marcadores
                 8. si falla la verificación o no ahorra → se devuelve el original con explicación
  renderPage()→ PNG para miniaturas / comparador
```

Alrededor de `compressPdf` hay dos capas: `smart.ts` fija DPI/calidad según el tipo de documento cuando el
preset es "Inteligente" (escaneado 150 dpi/q70, presentación 130/q72, texto con pocas imágenes 150/q82…), y
`target.ts` (`compressToTarget`) recorre la escalera de presets (máx. 4 pasadas) cuando el usuario pide un
tamaño objetivo.

Límites locales: 150 MB (aviso, se sugiere la nube) y 400 MB (no se procesa en el navegador; botón
"Procesar en la nube"). En la nube el tope es `CLOUD_MAX_BYTES` (2 GiB); por encima de 400 MB el
contenedor salta el análisis WASM y usa Ghostscript nativo directamente (`NATIVE_THRESHOLD` en
`container/src/job.ts`).

## Por imagen (`images/process.ts`)

1. Saltar: stencil masks, diminutas, color-key mask, SMaskInData.
2. Decodificar con MuPDF a RGBA (cualquier filtro: JPX, JBIG2, CCITT, ICC, Indexed…).
3. Clasificar sobre la imagen original (`classify.ts`): foto / gráfico / escaneo / bilevel.
4. Paleta exacta (≤256 colores) calculada antes de redimensionar (gráficos).
5. Redimensionar (Lanczos3) al DPI objetivo relativo al tamaño dibujado; si había paleta,
   re-mapear al color más cercano para que siga siendo exacta.
6. Candidatos: bilevel (Sauvola → 1 bpc, CCITT al guardar; en automático solo si su SSIM contra el
   original supera el mínimo) · indexado/gris Flate · JPEG mozjpeg con verificación SSIM ≥ mínimo del
   preset (sube la calidad en pasos de 6 hasta 95).
7. Gana el más pequeño que supere el SSIM y ahorre ≥ 3 %. Se escribe con `writeRawStream` sobre
   la referencia indirecta y se actualiza el diccionario; la `/SMask` se redimensiona al mismo tamaño.

## Reglas duras de MuPDF.js 1.28.1

- No llamar `resolve()` sobre referencias a streams (el stream se pierde al guardar). `pdf/objects.ts`
  devuelve la referencia para streams; `get()`/`isStream()`/`read*Stream()`/`write*Stream()` resuelven solos.
- `isStream()`, `writeRawStream()`, `put()` van sobre la referencia indirecta.
- Opciones de guardado no soportadas por el build WASM: `compress-effort`, `linearize`.
- `sanitize` está prohibido: en un catálogo real de InDesign duplicaba caracteres en el texto extraído de
  35/44 páginas (la verificación fallaba y se devolvía el original). Ahorraba unos KB como mucho.
- El barrido de objetos (`pdf/cleanup.ts`) quita `/PieceInfo`, `PTEX.*` y los bloques `/Metadata` (XMP) de
  imágenes: Photoshop/InDesign cuelgan uno por imagen y pueden ser el 12 % del archivo.

## Unir (compositor de páginas)

`compose.ts` construye un `PDFDocument` vacío y copia páginas de los orígenes con un `PDFGraftMap` por
documento (recursos compartidos una sola vez; la misma página puede repetirse), aplica `/Rotate`, añade un
marcador por documento y verifica páginas + texto de muestra. La UI (`features/merge`) abre todos los
orígenes en un worker propio, renderiza miniaturas por lotes y arma la secuencia con `@dnd-kit`.

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
Herramientas auxiliares: `tools/bench/breakdown.ts` (dónde están los bytes de un PDF: imágenes, fuentes por
tipo, contenido, diccionarios) y `tools/bench/cloud-run.ts` (corre un archivo por la nube de producción desde
la terminal). Resultados y comparación con iLovePDF en `docs/benchmarks.md`; contrato para nuevas
herramientas en `docs/TOOLS.md`.

## Accesibilidad

- Auditoría automática con axe (WCAG 2.0/2.1 A y AA) en los tests e2e (`apps/web/e2e`), en la página inicial,
  con resultados y con el comparador abierto.
- La regla `color-contrast` se evalúa aparte porque el verde de marca de Polen (`primary-9 = #00922e`) sobre
  blanco da **4,08:1**, por debajo del mínimo AA (4,5:1) para texto menor de 18,66 px en negrita. Afecta a
  Button fill/stroke, Badge tonal y `primary/text` sobre `primary/subtle`. Es una decisión del sistema de
  diseño: conviene revisarla en Polen (por ejemplo, `primary/solid` = primary-10 `#038329` sube a ~4,4:1 y
  `primary-11 #018228` a ~4,6:1). En esta app se evitan esas combinaciones en textos propios (se usa `text-fg`
  o `text-fg-muted`).

## Tests end-to-end

```bash
pnpm --filter @prensa/web test:e2e     # genera fixtures (tsx e2e/make-fixtures.ts) y corre Playwright
```
Cubren: lote de 5 archivos → ZIP, cancelación, perfiles (guardar/restablecer/aplicar/persistir), comparador
con navegación de páginas, historial, versión móvil (drawer + barra inferior, sin scroll horizontal).
