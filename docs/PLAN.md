# Plan — Compresor PDF profesional desde cero (nombre de trabajo: **Prensa**)

> Nombre de trabajo "Prensa" (prensa = comprimir; corto, en español). Alternativas: Compacto, Ligero. Vive en una sola constante de branding; se cambia cuando quieras.

## 1. Contexto

- **Qué pasó**: `crunch-pdf` (Next.js + BullMQ + FastAPI + Ghostscript en Railway) funcionaba, pero no comprimía "tan bien": el motor principal era `gs pdfwrite`, que reescribe el documento completo (aplana formularios, pierde enlaces/etiquetas), usa una calidad JPEG fija por preset sin medir el resultado, estima el DPI de cada imagen asumiendo que ocupa toda la página, y el modo "Auto" solo distinguía escaneado vs no escaneado. Además el monolito de 3 procesos en Railway era pesado y caro de tener encendido.
- **Objetivo**: construir desde cero la herramienta de compresión PDF más competitiva posible frente a iLovePDF / Smallpdf, no comercial, de muy bajo costo, con el sistema de diseño **Polen** (`https://polen.cdc.cool`), y con una base pensada para sumar más herramientas PDF después.
- **Decisiones ya tomadas contigo**:
  1. **Procesamiento híbrido, local-first**: por defecto todo corre en el navegador (WASM). La nube entra solo para OCR, JBIG2/MRC de escaneos, reescritura con Ghostscript y archivos enormes.
  2. **Nube en Cloudflare** (Workers + Containers + R2). Costo total ≈ **US$5/mes** (plan Workers Paid) y se cobra el contenedor solo mientras procesa.
  3. **Alcance v1: solo compresión**, con hub/arquitectura lista para más herramientas.
  4. **Repo público, AGPL OK** → podemos usar MuPDF y Ghostscript (los mejores motores).

## 2. Qué rescatamos de crunch-pdf y qué cambiamos

| Rescatamos (ideas/código a portar) | Cambiamos |
|---|---|
| Análisis previo con desglose (imágenes/fuentes/streams), detección de escaneado, flags de interactividad (`analyze_pdf.py`, `interactivity.ts`) | El análisis corre en el navegador con MuPDF y mide el **DPI efectivo real** de cada imagen (matriz de dibujo), no una aproximación por página |
| Elección de códec por imagen: JPEG vs paleta indexada para gráficos planos (`recompress_images.py`) | Se generaliza: foto / gráfico / escaneo-texto / bilevel / con alfa, y se **mide SSIM** para garantizar calidad |
| Regla "nunca devolver algo más grande" | Se mantiene, pero explicando por qué ("ya estaba optimizado") en vez de silenciar |
| Modo que preserva interactividad (recomprimir imágenes in-place) | Pasa a ser **el camino por defecto**: nunca reescribimos el documento salvo que el usuario elija "Rasterizar" o "Reescribir (Ghostscript)" |
| Flags Ghostscript afinados (`ghostscript.ts`: DCT forzado, PassThroughJPEGImages=false, thresholds 1.0) | Ghostscript queda como motor **opcional en la nube** (reparar / reescribir / rasterizar / PDF/A) |
| Upload por chunks reanudable, tokens 24h, limpieza automática, cancelación | Se reimplementa sobre R2 multipart + Durable Objects (sin Redis, sin volumen, sin Python en el request path) |
| Fuente PP Neue Montreal saneada (`public/fonts/PPNeueMontreal-wght.woff2`) | Se reutiliza tal cual (es la tipografía de Polen) |
| Perfiles guardados, historial, notificaciones, ZIP por lote | Se mantienen (localStorage/IndexedDB, ZIP generado en el cliente con `fflate`) |

## 3. Por qué esto compite (diferenciales)

1. **Privacidad real**: los archivos no salen del equipo (iLovePDF/Smallpdf suben todo). Funciona offline (PWA).
2. **Calidad medible**: cada imagen se recomprime con mozjpeg y se verifica con SSIM contra el original; si baja del umbral del preset, sube la calidad automáticamente. Nadie en el mercado te enseña eso.
3. **Interactividad intacta por defecto**: enlaces, formularios, comentarios, marcadores, capas, etiquetas de accesibilidad y cifrado se conservan porque no reescribimos el documento. Con toggles para conservar/quitar/aplanar cada cosa.
4. **Transparencia**: análisis previo con desglose, estimación de ahorro por preset antes de comprimir, comparador antes/después con lupa, reporte por componente al terminar.
5. **Sin límites artificiales**: sin cuenta, sin 2 tareas/día, sin tope de 100 MB; el tope lo pone la RAM del equipo, y si no alcanza, la nube.
6. **Escaneos de verdad**: umbral adaptativo B/N en el cliente; OCR + JBIG2 + MRC en la nube (la técnica que usan Adobe/ABBYY y que iLovePDF no ofrece gratis).
7. **Objetivo de tamaño** ("que pese menos de 10 MB"): búsqueda automática del preset que cumple.

## 4. Arquitectura

```
┌──────────────── Navegador (PWA) ───────────────────────────┐
│ React 19 + Vite + Tailwind 4 + Polen                        │
│   ├─ Web Worker "engine" (Comlink)                          │
│   │    MuPDF.js 1.28 (wasm) · @jsquash/jpeg (mozjpeg)       │
│   │    @jsquash/resize (Lanczos) · ssim.js · fflate (ZIP)   │
│   │    → analiza, recomprime, verifica, renderiza previews  │
│   └─ Cliente nube (solo si el usuario lo pide / hace falta) │
└───────────────┬────────────────────────────────────────────┘
                │ https  (misma app: Worker sirve SPA + /api)
┌───────────────▼──────── Cloudflare (US$5/mes) ─────────────┐
│ Worker (Hono) ── /api/uploads (R2 multipart, partes 32 MiB) │
│                ── /api/jobs (crear, estado, cancelar, WS)    │
│                ── /api/jobs/:id/download (stream desde R2)   │
│ Durable Objects: SchedulerDO (cola FIFO, cupos, posición)    │
│                  JobDO (estado, progreso, WebSocket, alarma  │
│                        de limpieza a 24 h)                  │
│ Container "engine-cloud" (standard-3: 2 vCPU / 8 GiB,       │
│   max_instances 2, escala a cero, sleepAfter 2 min)         │
│   Node 22 runner + Ghostscript 10 + mupdf-tools + qpdf +     │
│   pikepdf + ocrmypdf + tesseract + jbig2enc (+ MRC opcional) │
│ R2 bucket "pdf-files" (10 GB gratis, egreso $0, lifecycle   │
│   1 día como red de seguridad)                              │
└─────────────────────────────────────────────────────────────┘
```

### Stack

| Capa | Elección | Por qué |
|---|---|---|
| Frontend | **Vite 7 + React 19 + TypeScript strict + Tailwind 4** | Polen es React + Tailwind 4; no necesitamos SSR/SEO; Vite integra perfecto con Workers (`@cloudflare/vite-plugin`) y con WASM en workers. Next.js sobraba. |
| Router / estado | TanStack Router (file-based) · Zustand 5 · Comlink para el worker | Hub de herramientas con rutas tipadas; Zustand ya lo conoces |
| Diseño | **Polen** (tokens + componentes vía registry `https://polen.cdc.cool/r/*.json`, `@base-ui/react`), PP Neue Montreal, íconos FDS, GSAP con tokens de motion de Polen | Es tu sistema; 33/39 componentes ya en código |
| Motor local | **MuPDF.js 1.28.1** (AGPL) + **@jsquash/jpeg** (mozjpeg) + **@jsquash/resize** + **ssim.js** | MuPDF decodifica cualquier filtro (JPX, JBIG2, CCITT…), expone `Device.fillImage` (DPI efectivo), `PDFObject.writeRawStream` (reemplazo in-place), `subsetFonts()`, `saveToBuffer("garbage=deduplicate,compress,…")`, render para previews. mozjpeg da 10-20 % menos bytes que libjpeg a igual calidad. |
| API | **Cloudflare Worker + Hono 4**, Durable Objects, R2 bindings | Un solo `wrangler deploy` sirve SPA + API; sin Redis ni DB |
| Motor nube | **Cloudflare Container** (Debian trixie): Node 22 runner (NDJSON de progreso), Ghostscript 10.x, mupdf-tools 1.28, qpdf 12, Python 3.12 + pikepdf 10 + ocrmypdf 17, tesseract 5 (spa/eng/por/fra/deu/ita), jbig2enc, `archive-pdf-tools` (MRC, experimental) | Toda la potencia server-side de Crunch y más, pero pagando solo los minutos que corre |
| Calidad | Vitest · Playwright · corpus de benchmark + harness (tamaño, SSIM, texto, interactividad, validez) | "El mejor" se demuestra con números |
| CI/CD | GitHub Actions: lint/typecheck/tests/bench-smoke → `wrangler deploy`; imagen del contenedor con `wrangler containers build --push` (Docker disponible en el runner) | Sin Docker local no bloquea el deploy |
| Licencia | AGPL-3.0 | Compatible con MuPDF/Ghostscript |

### Costo estimado

| Concepto | Costo |
|---|---|
| Workers Paid (Workers, Static Assets, DOs, Containers con 25 GiB-h + 375 vCPU-min incluidos, R2 10 GB) | US$5/mes fijo |
| Contenedor standard-3 procesando (8 GiB × $0.0000025/s + 2 vCPU × $0.00002/s) | ≈ US$0.22 por hora **activa**; 0 dormido |
| R2 egreso | $0 |
| Dominio | subdominio de `cdc.cool` (sin costo) |
| **Total realista** | **≈ US$5–7/mes** |

Vercel queda descartado para el motor (funciones sin binarios, límites de tiempo/tamaño) y Cloudflare ya da el hosting estático gratis. Railway costaría US$5 + RAM siempre encendida (≈ US$10/GB/mes → un worker de 8 GB ≈ US$80/mes salvo que duerma).

## 5. Motor de compresión (el corazón)

### 5.1 Análisis (`packages/engine/src/analyze.ts`)

Corre en el worker en 1–5 s, sin subir nada:
- Abre con MuPDF (`needsPassword` → pedir contraseña; recordar si preservar cifrado).
- **Inventario de imágenes**: recorre `/Resources /XObject` de cada página y Form XObjects anidados (dedupe por número de objeto). Por imagen: ancho/alto, bpc, colorspace (Gray/RGB/CMYK/ICC/Indexed/Separation), filtro (DCT/JPX/JBIG2/CCITT/Flate), bytes, `/SMask`/`/Mask`/ImageMask, `/Decode`, `/Interpolate`.
- **DPI efectivo real**: ejecuta cada página con un `Device` JS que implementa `fillImage(image, ctm)` para obtener el tamaño dibujado de cada imagen (puede aparecer en varias páginas con distinto tamaño → se usa el mayor). Emparejamos `Image` del device con el XObject por identidad de puntero (MuPDF cachea) y, como fallback, por dimensiones+bpc+componentes.
- **Fuentes**: embebidas, subconjunto o no, bytes por `FontFile*` (dedupe).
- **Texto**: `toStructuredText` en muestra de páginas → páginas con/sin texto → escaneado, mixto, texto, presentación, vectorial.
- **Interactividad y extras**: AcroForm (+ campos firmados `/FT /Sig` → advertencia "la firma se invalidará"), Annots por tipo (Link vs resto), Outlines, JavaScript/OpenAction/AA, OCProperties (capas), EmbeddedFiles, StructTreeRoot/MarkInfo (accesibilidad), `/PieceInfo` (datos privados de Illustrator/InDesign, a veces enormes), `/Thumb`, `/Metadata` XMP, `/Alternates`/OPI, cantidad de actualizaciones incrementales (historial oculto), objetos no referenciados.
- **Desglose de bytes**: imágenes / fuentes / contenido / metadatos y privados / otros, con % del total.
- **Estimación por preset**: modelo por imagen (píxeles a DPI objetivo × bits estimados por píxel según calidad y tipo) + ahorro estructural estimado → tamaño estimado por preset antes de comprimir.

### 5.2 Pipeline local (`packages/engine/src/compress.ts`)

1. **Preparación**: abrir, autenticar, decidir si cabe en memoria (tamaño × factor vs `navigator.deviceMemory`); si no, ofrecer nube.
2. **Imágenes (in-place, sin reescribir el documento)**. Para cada imagen única:
   - Decodificar con `doc.loadImage(ref).toPixmap()` (maneja JPX/JBIG2/CCITT/ICC).
   - Clasificar: **foto** (muchos colores, gradientes), **gráfico/captura** (≤ 256 colores o bordes duros), **escaneo texto** (gris de alta resolución con histograma bimodal), **bilevel** (1 bpc), **con alfa** (`/SMask`), **stencil** (ImageMask), **diminuta** (< 64 px o < 4 KB → no tocar).
   - Redimensionar solo hacia abajo (Lanczos3) al DPI objetivo del preset relativo al **tamaño dibujado**; umbral de 1.15× para no reprocesar lo que ya está cerca.
   - Codificar candidatos y quedarse con el más pequeño **que supere el SSIM mínimo del preset** y **sea menor que el original**:
     - Foto → mozjpeg (trellis, optimize) con submuestreo 4:2:0 si el preset lo permite y la imagen es ≥ 600 px; si SSIM < mínimo, sube calidad en pasos de 5 hasta 95.
     - Gráfico ≤ 256 colores → Indexed + Flate (exacto). Gráfico con más colores → mozjpeg 4:4:4 con +8 de calidad.
     - Escaneo texto → gris JPEG q70 a min(300, DPI preset) o, si el usuario activa B/N, umbral adaptativo Sauvola → 1 bpc → CCITT G4 (MuPDF lo codifica con la opción `compress`).
     - Bilevel ya comprimido (CCITT/JBIG2) → conservar; solo submuestrear si supera 600 dpi.
     - Con alfa → base JPEG + `/SMask` reescalado al mismo tamaño en Flate 8 bits (nunca perder la transparencia).
     - CMYK: en presets ≤ Equilibrado se convierte a RGB (uso pantalla); en Impresión/Máxima se conserva el espacio de color e ICC original.
   - Escribir con `writeRawStream` + actualizar dict (`/Filter`, `/Width`, `/Height`, `/ColorSpace`, `/BitsPerComponent`, borrar `/DecodeParms`/`/Decode` inválidos). Registrar antes/después por imagen para el reporte.
3. **Fuentes**: `doc.subsetFonts()` (experimental en MuPDF) protegido: se compara el texto estructurado de páginas de muestra antes/después; si difiere, se revierte a la copia sin subsetear.
4. **Limpieza estructural** (toggles, ver 5.4): metadatos, XMP, miniaturas, JavaScript/acciones, `/PieceInfo`, alternates/OPI, adjuntos, capas ocultas, anotaciones, formularios (con `bake()` para aplanar si se elige), historial de versiones (implícito al guardar completo).
5. **Guardar**: `saveToBuffer("garbage=deduplicate,compress,compress-fonts,compress-images,compress-effort=100,objstms,sanitize" + (preservar cifrado ? ",encrypt=keep" : ",encrypt=none"))`.
6. **Verificar**: reabrir la salida; mismas páginas; render de 1–3 páginas de muestra a 72 dpi antes/después con SSIM ≥ umbral; texto estructurado idéntico (salvo modo rasterizar); conteo de enlaces/campos/marcadores igual si se pidió conservar. Si falla, reintento con parámetros más conservadores; si sigue fallando, se entrega el original con explicación.
7. **Nunca más grande**: si el resultado ≥ original, se devuelve el original y se informa "este PDF ya estaba optimizado (tiene JBIG2/JPX/…)" con sugerencias (modo Pantalla, nube).
8. **Modos especiales**:
   - **Rasterizar / aplanar todo**: render de cada página con MuPDF → JPEG (o CCITT si B/N) → PDF nuevo. Advertencia explícita: se pierde texto e interactividad.
   - **Objetivo de tamaño**: búsqueda en la escalera de presets/DPI/calidad (máx. 4 pasadas) hasta cumplir "< N MB".

### 5.3 Presets

| Preset | DPI color/gris | DPI mono | JPEG q foto / gráfico | Chroma | SSIM mín. | Uso |
|---|---|---|---|---|---|---|
| **Inteligente** ★ (default) | por imagen | por imagen | por imagen | por imagen | 0.94 | elige por contenido; máximo ahorro con calidad percibida de "Equilibrado" |
| Sin pérdida | — | — | — (solo Flate/paleta exacta) | — | 1.00 | archivar; ahorro 5–35 % vía dedupe, subset, limpieza |
| Máxima fidelidad | 300 | 600 | 92 / 95 | 4:4:4 | 0.98 | imprenta, archivo |
| Impresión | 220 | 600 | 85 / 90 | 4:4:4 | 0.96 | imprimir en oficina |
| Equilibrado | 150 | 400 | 75 / 82 | 4:2:0 (≥ 600 px) | 0.94 | compartir, uso general |
| Pantalla / Email | 110 | 300 | 62 / 72 | 4:2:0 | 0.90 | email, web |
| Mínimo | 80 | 200 | 50 / 62 | 4:2:0 | 0.85 | adjuntos con límite estricto |

Avanzado: DPI manual (72–600), calidad manual (30–95), chroma, color (color / escala de grises / blanco y negro adaptativo), umbral de redimensión, "no tocar imágenes ya JPEG con q ≤ X".

### 5.4 Conservar / eliminar / aplanar (interactividad)

- **Conservar (activado por defecto)**: enlaces, formularios, anotaciones y comentarios, marcadores, etiquetas de accesibilidad, capas, adjuntos, cifrado existente, título/autor.
- **Eliminar (activado por defecto)**: miniaturas, JavaScript y acciones automáticas, datos privados de aplicaciones (`/PieceInfo`), imágenes alternas/OPI, objetos duplicados y sin usar, historial de versiones, XMP redundante.
- **Opcional (desactivado)**: eliminar todos los metadatos, eliminar anotaciones, eliminar formularios, eliminar marcadores, eliminar capas, eliminar adjuntos, eliminar estructura de accesibilidad, **aplanar** formularios/anotaciones (`bake`), quitar cifrado (requiere contraseña de propietario).
- PDFs **firmados**: aviso "cualquier cambio invalida la firma" con opciones "no tocar" (default) / "continuar".

### 5.5 Pipeline nube (`apps/engine-cloud`)

Mismo `CompressionSpec` (zod) que el cliente + etapas exclusivas:
1. `repair`: `qpdf --warning-exit-0` (normaliza xref rotos).
2. `structural`: pikepdf con las mismas reglas de 5.4.
3. Una de: `images:mutool` (`mutool clean` con `--*-image-recompress-method`/`--*-subsample-dpi`, rápido y nativo), `images:ghostscript` (reescritura completa, flags heredados de Crunch afinados; para PDFs patológicos o cuando el usuario lo elige), `rasterize:ghostscript` (`pdfimage24/8`, `tiffg4`).
4. `ocr`: ocrmypdf (`-l spa+eng…`, `--skip-text`/`--force-ocr`, `--rotate-pages`, `--deskew` opcional, `--output-type pdf`; PDF/A opcional).
5. `jbig2`: escaneos bilevel → JBIG2 (genérico sin pérdida, o simbólico con pérdida controlada) con jbig2enc + pikepdf.
6. `mrc` (experimental, fase 4): `archive-pdf-tools recode_pdf` → máscara de texto JBIG2 + fondo/primer plano JPEG2000 (3–15× en escaneos).
7. `finalize`: `mutool clean -gggg -z -f -i`, `qpdf --linearize` opcional, `qpdf --check`, verificación de páginas/texto.

Runner: servidor HTTP mínimo (Hono/Node) dentro del contenedor: `POST /run` (spec + claves R2) → descarga input desde R2 (API S3 con token acotado al bucket), ejecuta etapas con timeouts y cancelación (SIGKILL al grupo de procesos), emite progreso NDJSON hacia `POST /internal/jobs/:id/progress` del Worker (secreto compartido), sube el resultado a R2 (multipart). `POST /cancel`.

## 6. Orquestación en Cloudflare

- **Subida**: `POST /api/uploads` → `bucket.createMultipartUpload`; el cliente sube partes de 32 MiB por `PUT /api/uploads/:id/parts/:n` (bajo el límite de 100 MB del Worker), reanudable (etags en IndexedDB); `POST /complete`. Validación `%PDF-`, tamaño máx. 2 GB.
- **Trabajos**: `POST /api/jobs` → `JobDO` (id UUID; guarda spec, estado, progreso) → se registra en `SchedulerDO` (singleton: FIFO, `MAX_RUNNING=2`, posición en cola visible). El scheduler arranca `getContainer(env.ENGINE, jobId)` (un contenedor por trabajo, aislado; `max_instances: 2`), y al terminar arranca el siguiente. Watchdog por alarma (timeout 20 min por etapa).
- **Progreso**: WebSocket `GET /api/jobs/:id/ws` servido por `JobDO` (fallback polling `GET /api/jobs/:id`).
- **Descarga**: `GET /api/jobs/:id/download?t=<HMAC>` → stream desde R2 con `Content-Disposition`. Válido 24 h; botón "Eliminar ahora".
- **Limpieza**: input borrado al terminar; alarma del `JobDO` borra el resultado a las 24 h; regla lifecycle de R2 (1 día) como red de seguridad.
- **Abuso** (la nube es pública y gratis): cuota por IP/día (`QuotaDO`), Turnstile opcional, y `CLOUD_ACCESS_CODE` opcional para restringir la nube a tu equipo. Ghostscript siempre con `-dSAFER`.
- **Config** (`apps/web/wrangler.jsonc`): `assets` (SPA, `not_found_handling: single-page-application`), `r2_buckets`, `durable_objects` (JobDO, SchedulerDO, QuotaDO, EngineContainer), `containers` (`instance_type: standard-3`, `max_instances: 2`, `image: ../engine-cloud/Dockerfile`), secretos (`R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `INTERNAL_SECRET`, `CLOUD_ACCESS_CODE`).

## 7. UI/UX con Polen

### Integración técnica
- Registry real: `https://polen.cdc.cool/r/{tokens,button,card,…}.json` (la doc muestra `polen.example` como placeholder y las `registryDependencies` internas también apuntan a `polen.example` → el CLI de shadcn fallaría). Solución: script `pnpm ds:sync` (`tools/polen-sync.ts`) que descarga `registry.json`, baja cada item, reescribe `polen.example` → `polen.cdc.cool`, y escribe `apps/web/src/components/ds/*.tsx` + `apps/web/src/styles/tokens.css`. Se versionan los archivos generados. Reporte a Polen del placeholder (es tu DS).
- CSS: `@import "tailwindcss"; @import "./tokens.css"; @custom-variant dark (&:where([data-theme="dark"], [data-theme="dark"] *));`. Dark mode con `data-theme` en `<html>` (sistema por defecto + toggle persistido).
- Fuente: `PPNeueMontreal-wght.woff2` (copiada de crunch-pdf) con `@font-face` → `--font-pp-neue`.
- Íconos: `components/ds/icons.tsx` de Polen (grilla 20×20, stroke 1.667, `currentColor`); los que falten se dibujan con el mismo estilo (no mezclar Lucide).
- Motion: GSAP + `@gsap/react` con `--ds-ease-*` / `--ds-duration-*`; `prefers-reduced-motion` respetado.
- Componentes Polen a usar: Button, Card, Tabs, Radio/Checkbox/Switch + ItemContent, Select, Input, Accordion, Progress, Badge/Chip, Tooltip, Toast, Alert/Banner, Modal, Drawer, Stepper, Table, Skeleton, Empty State, Spinner, Divider, Menu.
- Componentes propios (siguiendo patrones/tokens de Polen; candidatos a subir a Polen): `FileDropzone` (Polen lo tiene "planned"), `Slider` (Base UI Slider + tokens), `PresetCards` (radio cards con estimación), `SizeBreakdownBar`, `CompareViewer` (antes/después con slider, lupa, zoom, navegación de páginas), `StatNumber` (tabular-nums), `FileCard`, `JobProgress`.

### Flujo
1. **Hub/shell**: header con logo, nav de herramientas ("Comprimir" activa; otras "pronto"), toggle de tema. Hero con dropzone multi-archivo (arrastrar, clic, pegar, carpeta) y sello "Se procesa en tu dispositivo · nada se sube".
2. **Tarjetas por archivo** al instante: miniatura (render página 1), nombre, tamaño, páginas, chip de tipo, barra de desglose, flags (formularios, enlaces, firma ⚠, cifrado 🔒), y estimación por preset.
3. **Panel de ajustes** (columna derecha en desktop, drawer en móvil): presets como tarjetas con tamaño estimado ("~2.1 MB, −74 %"); acordeón "Avanzado" (DPI, calidad, chroma, color, conservar/eliminar/aplanar, escaneo B/N, objetivo de tamaño, nombre de salida `{original}-comprimido.pdf`); "Nube" (OCR idioma, JBIG2, MRC, reescribir con Ghostscript); perfiles guardados.
4. **Botón** Fill xl: "Comprimir 3 archivos · ~ −74 %". Progreso por archivo con etapa y %, cancelar; lote en paralelo (min(núcleos−1, 3) workers) con guardia de memoria.
5. **Resultados**: antes → después, %, desglose por componente, "Comparar", "Descargar", "Otro preset" (reusa análisis), "Descargar todo (ZIP)", "Enviar a la nube para OCR…". Toast al terminar; Notification API si la pestaña está oculta.
6. **Historial** (últimos 20, metadatos en IndexedDB) y **perfiles** (localStorage).
7. **Trabajo en nube**: subida reanudable con %, posición en cola, etapas, enlace de descarga 24 h, "Eliminar ahora".
8. Accesibilidad WCAG AA (foco visible con `focus/ring`, teclado completo, live regions para progreso), responsive móvil/tablet/desktop, español por defecto con diccionario `t()` listo para inglés.

## 8. Estructura del repositorio

```
pdf-compress/                     (monorepo pnpm + turborepo, AGPL-3.0)
├── apps/
│   ├── web/                      Vite SPA + Worker (un solo deploy)
│   │   ├── src/                  rutas (TanStack), features/compress, components/ds (Polen), styles/tokens.css
│   │   ├── worker/               Hono API, JobDO, SchedulerDO, QuotaDO, EngineContainer
│   │   ├── public/fonts/         PPNeueMontreal-wght.woff2
│   │   └── wrangler.jsonc
│   └── engine-cloud/             Dockerfile (Debian trixie) + runner Node + scripts Python
├── packages/
│   ├── engine/                   análisis + compresión (browser y Node) — el corazón
│   ├── schema/                   zod: CompressionSpec, AnalysisReport, JobState, eventos
│   └── config/                   eslint, tsconfig, prettier compartidos
├── tools/
│   ├── polen-sync.ts             sincroniza el DS desde el registry
│   └── bench/                    corpus + harness + reportes
├── docs/                         ADRs, benchmarks.md, deploy.md
├── .github/workflows/            ci.yml, deploy.yml
├── CLAUDE.md · README.md · LICENSE (AGPL-3.0)
```

## 9. Fases

### Fase 0 — Cimientos (1 semana)
- Monorepo, tooling, CI, `packages/schema`, `packages/engine` esqueleto con MuPDF cargando en worker.
- Polen: `polen-sync`, tokens, fuente, dark mode, shell (header/hub/footer), página "Comprimir" vacía con Polen.
- Cloudflare: cuenta + `wrangler login`, Worker con assets + `/api/health`, R2 bucket, primer deploy en `prensa.cdc.cool` (o el subdominio que elijas).
- **Verificación**: `pnpm dev` abre la app con Polen aplicado; `pnpm test` verde; deploy responde; Lighthouse a11y ≥ 95.

### Fase 1 — Motor local v1: ya comprime mejor que Crunch (2 semanas)
- `analyze.ts` completo (5.1) y `compress.ts` con imágenes in-place, SSIM guard, subset de fuentes verificado, limpieza estructural, guardar, verificar, "nunca más grande".
- Worker + Comlink, progreso granular, cancelación, guardia de memoria.
- UI mínima: dropzone → tarjetas con análisis → presets → comprimir → descargar.
- `tools/bench` inicial con 10 PDFs (texto, escaneado, fotos, presentación, formulario, firmado, ya optimizado por iLovePDF, JPX, CMYK, 200 MB).
- **Verificación**: bench muestra Equilibrado con SSIM ≥ 0.94 y tamaño ≤ salida de Crunch en todo el corpus; formularios/enlaces/marcadores intactos (conteo igual); `qpdf --check` limpio; Playwright: flujo completo con un PDF real.

### Fase 2 — Experiencia completa (2 semanas)
- Presets con estimación, avanzado, conservar/eliminar/aplanar, B/N adaptativo, comparador antes/después, lotes + ZIP, perfiles, historial, notificaciones, PWA offline, i18n base, responsive, accesibilidad.
- **Verificación**: Playwright para lote de 5, cancelación, perfiles, comparador; PWA instala y comprime sin red; axe sin violaciones.

### Fase 3 — Nube (2 semanas)
- `engine-cloud` (Dockerfile, runner, etapas 5.5 sin MRC), API + DOs (sección 6), subida multipart reanudable, WebSocket de progreso, descarga 24 h, limpieza, cuotas, CI que construye/pushea la imagen.
- Enrutamiento: sugerir nube si archivo > 200 MB o RAM insuficiente; obligatoria para OCR/JBIG2/Ghostscript.
- **Verificación**: job real de 500 MB extremo a extremo; OCR en escaneado con texto seleccionable resultante; contenedor duerme y la factura del mes sigue en ~US$5; borrado a 24 h comprobado; cancelación mata el proceso.

### Fase 4 — Excelencia y benchmark (1–2 semanas)
- Corpus a ~30 PDFs; comparación manual contra iLovePDF (Recomendada/Extrema) y Smallpdf (Básica/Fuerte) documentada en `docs/benchmarks.md`; ajuste fino de presets e "Inteligente".
- Objetivo de tamaño, modo Rasterizar, MRC experimental, PDF/A y linearize opcionales, mensajes de error específicos.
- Arquitectura de "tool modules" documentada (registro de herramienta = ruta + panel + función del engine) para las próximas herramientas.
- **Verificación**: metas → Equilibrado ≤ iLovePDF Recomendada ±10 % con SSIM ≥ 0.94; Pantalla ≤ iLovePDF Extrema con SSIM ≥ 0.90; 0 regresiones de interactividad; ningún archivo del corpus sale más grande.

## 10. Pruebas y benchmark

- **Unit (Vitest)**: decisiones por imagen, DPI efectivo, reescritura de diccionarios, SSIM, presets, estimador, scheduler DO (con `@cloudflare/vitest-pool-workers`).
- **Integración (Node)**: engine sobre el corpus (mismo WASM que el navegador).
- **E2E (Playwright)**: flujos de UI con WASM real; nube con `wrangler dev` y contenedor local (o mock del runner).
- **Bench (`pnpm bench`)**: por preset y archivo → tamaño, %, tiempo, SSIM (render 100 dpi), igualdad de texto, conteo de enlaces/campos/marcadores/anotaciones, `qpdf --check`. Reporte Markdown/HTML; umbrales en CI (smoke con 5 archivos).

## 11. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| `subsetFonts()` experimental en MuPDF | Verificación de texto antes/después; revertir si difiere |
| Límite de memoria WASM (~2 GB Chrome, menos en Safari) | Detección de RAM, OOM capturado → ofrecer nube; imágenes procesadas una a una liberando pixmaps |
| Emparejar imagen del `Device` con el XObject | Identidad de puntero (caché MuPDF) + fallback por dimensiones; test en corpus |
| Registry de Polen con `polen.example` | `polen-sync` reescribe; archivos generados versionados |
| Sin Docker en tu Mac | OrbStack (gratis uso personal) para probar el contenedor localmente, o dejar que GitHub Actions construya y pushee la imagen |
| Entradas ya en JPX/JBIG2 | Regla "menor gana"; nunca recodificar bilevel a JPEG |
| Fidelidad de color CMYK/ICC | Conservar espacio e ICC en Impresión/Máxima; caso CMYK en el corpus |
| Abuso de la nube pública | Cuotas por IP, Turnstile, código de acceso opcional |
| MuPDF ya no linealiza | `qpdf --linearize` opcional en la nube; "fast web view" es raro hoy |

## 12. Fuera de alcance v1
Cuentas/login, pagos, email, otras herramientas (solo el hub), PDF→Word, edición de texto, firma digital.

## 13. Verificación end-to-end del proyecto
```bash
pnpm install && pnpm ds:sync          # Polen sincronizado
pnpm dev                               # http://localhost:5173 (SPA + Worker local)
pnpm test && pnpm test:e2e             # unit + integración + Playwright
pnpm bench                             # corpus → tools/bench/report.html
pnpm --filter web deploy               # wrangler deploy (SPA + API + contenedor)
```
Checklist manual: PDF con formulario → comprimido conserva campos rellenables; PDF firmado → aviso; PDF escaneado → B/N adaptativo local y OCR en nube; 500 MB → nube con reanudación; lote de 10 → ZIP; offline → sigue comprimiendo; dark/light con Polen; móvil.

## 14. Lo que necesito de ti (no bloquea el arranque)
1. Cuenta Cloudflare con **Workers Paid** (US$5/mes) y `wrangler login` (hoy no está logueado) — necesario para Fase 0 final/Fase 3.
2. Subdominio para la app (ej. `prensa.cdc.cool`).
3. Instalar **OrbStack** o Docker Desktop si quieres probar el contenedor localmente (opcional; CI lo construye igual).
4. Confirmar el nombre del producto (o seguimos con "Prensa").
5. Repo en GitHub (`bryansugu/…`) para CI/CD.
