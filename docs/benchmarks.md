# Benchmarks — Prensa frente a iLovePDF y Ghostscript

Fecha: 2026-09-28 · motor local `packages/engine` (MuPDF.js 1.28.1 + mozjpeg) · nube `prensa-enginecontainer`
(Ghostscript 10, qpdf, ocrmypdf) · comparación manual con iLovePDF web.

## Metodología

- **Prensa**: `pnpm bench` (`tools/bench/run.ts`) sobre `tools/bench/corpus/`. Para cada preset mide tamaño,
  tiempo (Node 24, M1), **SSIM de página** (render a 100 dpi del original y del resultado, mínimo entre las
  páginas de muestra), igualdad del texto extraído, conteo de enlaces/campos/marcadores/anotaciones y
  `qpdf --check`. Un resultado solo cuenta si texto e interactividad quedan intactos.
- **iLovePDF**: herramienta "Compress PDF" web, nivel *Recommended compression*, tamaño según su página de
  descarga. No se descargó el archivo, así que su SSIM y su interactividad no están verificados aquí.
- **Ghostscript**: `gs 10.05` local con exactamente los flags del motor "Reescribir" de la nube
  (`container/src/stages.ts`: pdfwrite, 150 dpi, JPEG q75, DetectDuplicateImages, SubsetFonts). Ghostscript
  reescribe el documento: aplana o pierde formularios XFA/AcroForm, adjuntos y etiquetas.

## Resultados (corpus real)

| Archivo | Contenido | Original | **Inteligente** | Equilibrado | Pantalla | iLovePDF Recomendada | Nube · Ghostscript |
|---|---|---:|---:|---:|---:|---:|---:|
| attention.pdf (paper LaTeX, figuras Illustrator, enlaces + marcadores, 15 págs) | texto | 2,11 MB | **1,28 MB (−39,5 %)** | 1,28 MB (−39,6 %) | 1,26 MB (−40,5 %) | 1,37 MB (−36 %) | 1,23 MB (−42 %) |
| gpt3-paper.pdf (paper, 75 págs, 74 imágenes) | mixto | 6,45 MB | **1,79 MB (−72,3 %)** | 1,79 MB (−72,3 %) | 1,16 MB (−82,0 %) | 1,25 MB (−81 %) | 1,52 MB (−76 %) |
| f1040-formulario.pdf (AcroForm + XFA del IRS, 2 págs) | formulario | 215 KB | **137 KB (−36,3 %)** | 137 KB (−36,3 %) | 137 KB (−36,3 %) | 164 KB (−24 %) | 64 KB (−70 %, pierde el formulario) |
| catálogo InDesign (44 págs, 221 imágenes ICC + 153 máscaras suaves, enlaces) | presentación | 20,4 MB | **5,35 MB (−73,8 %)** | 7,19 MB (−64,8 %) | 3,55 MB (−82,6 %) | 6,8 MB (−67 %; Smallpdf igual) | 7,04 MB (−66 %) |

SSIM de página ≥ 0,994 en todas las filas de Prensa; texto idéntico; enlaces, marcadores y campos de
formulario conservados; `qpdf --check` limpio.

## Resultados (corpus sintético, `test/fixtures.ts`)

| Archivo | Contenido | Original | Inteligente | Equilibrado | Pantalla | Sin pérdida |
|---|---|---:|---:|---:|---:|---:|
| escaneo.pdf (JPEG 300 dpi, texto gris) | escaneado | 2,17 MB | 377 KB (−83,1 %) | 402 KB (−81,9 %) | 191 KB (−91,4 %) | 2,17 MB (0 %) |
| grafico.pdf (JPEG de un gráfico plano) | gráfico | 40,9 KB | 5,34 KB (−86,9 %) | 5,34 KB | 3,16 KB (−92,3 %) | 7,03 KB (−82,8 %, paleta exacta) |
| informe-fotos.pdf (3 fotos sin comprimir) | imágenes | 8,86 MB | 31,3 KB (−99,7 %) | 31,3 KB | 25,2 KB | 8,86 MB (0 %) |

El SSIM de página del escaneo sintético es poco fiable (el ruido por píxel del fixture no sobrevive a ningún
remuestreo); el SSIM por imagen que usa el motor sí lo es. Falta un escaneo real en el corpus.

## Caso real: catálogo de 20 MB que "no bajaba"

El usuario reportó que Prensa no hacía nada con un catálogo de 21 MB que iLovePDF y Smallpdf dejaban en
6,8 MB. Diagnóstico con `tools/bench/diagnose.ts`: el motor sí recomprimía 218 imágenes (−12 MB), pero la
verificación de texto fallaba y, por la regla de seguridad, se devolvía el original. La causa era la opción
`sanitize` del guardado de MuPDF: reescribe los content streams y en este PDF de InDesign duplicaba
caracteres en el texto extraído de 35 de 44 páginas. `sanitize` se eliminó (ahorraba unos KB como mucho).
Además, el archivo llevaba 312 bloques XMP colgados de las imágenes (2,4 MB, 12 %): el barrido de objetos
ahora los quita. Resultado: 5,35 MB en Inteligente (frente a 6,8 MB de la competencia), texto idéntico,
enlaces intactos, `qpdf --check` limpio y las 44 páginas renderizan.

## Qué cambió en esta ronda (y por qué)

1. **Barrido de datos privados en todos los objetos.** `attention.pdf` traía 58 streams `AIPrivateData` de
   Illustrator (301 KB, 14,7 % del archivo) colgados del `/PieceInfo` de cada figura, más claves `PTEX.*` de
   pdfTeX. Antes solo se limpiaba el catálogo y las páginas: 1,56 MB → **1,28 MB**.
2. **XFA duplicado en formularios híbridos.** El f1040 lleva 11 paquetes XFA (60 KB) que repiten el AcroForm.
   Se eliminan solo si hay AcroForm con campos y no es XFA dinámico (`NeedsRendering`): 199 KB → **137 KB**
   con el formulario funcionando. Opción `Eliminar → Datos XFA duplicados`, activada por defecto.
3. **Sin `sanitize`.** MuPDF reescribe los content streams con `sanitize`; en gpt3-paper los agrandaba
   22 KB y en el catálogo real alteraba el texto extraíble. Se quitó del guardado.
4. **B/N automático bajo garantía SSIM.** El candidato bilevel (Sauvola) ya no se acepta solo por ser el más
   pequeño: debe superar el SSIM mínimo del preset frente al original, como el JPEG.
5. **Inteligente en escaneos: 150 dpi / q70** (antes 200 dpi): mismo SSIM de página (0,993) y 25 % menos.
6. **Adjuntos**: si se conservan y pesan ≥ 5 % del archivo, el resultado lo dice y cómo quitarlos.

## Dónde está el hueco que queda

- **gpt3-paper (1,79 vs 1,25 MB)**: nuestras imágenes a 150 dpi/q75 ocupan 1,25 MB del total; iLovePDF
  parece bajar más el DPI o la calidad (nuestro preset Pantalla da 1,16 MB). Las 20 fuentes Type1 (211 KB)
  pasarían a CFF con Ghostscript (~−80 KB); los content streams (238 KB) se beneficiarían de un Flate más
  agresivo. El motor local no toca fuentes ni contenido por diseño (interactividad intacta).
- **attention (1,28 vs 1,23 MB de Ghostscript)**: 2 565 Form XObjects con grupo de transparencia cuyos
  diccionarios pesan ~500 KB. Inlinearlos en el contenido es posible pero exige verificar que el grupo
  no cambie la composición; queda como mejora futura.
- Modo **MRC** para escaneos (máscara JBIG2 + fondo JPEG2000) y **PDF/A** siguen pendientes (Fase 4+).

## Archivos gigantes (nube)

`tools/bench/cloud-run.ts` subió un PDF de prueba de **699 MB y 360 páginas** a `https://pdf.cdc.cool`
(22 partes de 32 MiB, 2 en paralelo, ≈2 MB/s de subida doméstica):

| Etapa | Tiempo |
|---|---:|
| Subida multipart | 348 s (limitada por el ancho de banda local) |
| Descarga R2 → contenedor | 13 s |
| Ghostscript nativo (>400 MB salta el análisis WASM) | 77 s |
| Subida del resultado + fin | 6 s |
| **Trabajo completo** | **102 s** |

Resultado: 360 páginas, `qpdf --check` limpio, 185 KB (el fixture repetía la misma imagen; Ghostscript la
deduplica). El tope actual es `CLOUD_MAX_BYTES` = 2 GiB por archivo, con contenedor `standard-3` (8 GiB RAM).
En el navegador el límite duro es 400 MB (aviso desde 150 MB); por encima, la tarjeta ofrece "Procesar en la nube".

## Reproducir

```bash
pnpm exec tsx tools/bench/run.ts                          # corpus completo → tools/bench/out/report.md
pnpm exec tsx tools/bench/breakdown.ts archivo.pdf         # dónde están los bytes (imágenes, fuentes, dicts…)
pnpm exec tsx tools/bench/cloud-run.ts archivo.pdf --base https://pdf.cdc.cool --preset smart
```
