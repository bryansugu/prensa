# Herramientas (tool modules) — cómo añadir la siguiente

Prensa tiene dos herramientas: **Comprimir** (`features/compress`) y **Unir** (`features/merge`, un
compositor de páginas: cada documento se abre con miniaturas y el resultado se arma página a página con
arrastrar y soltar o con selección + «insertar aquí»). Este documento fija el contrato para las siguientes
(Dividir, Rotar, OCR…).

## Unir, en concreto

- Motor: `packages/engine/src/compose.ts` → `composeDocument(mupdf, sources, spec)`. Copia páginas entre
  documentos abiertos con `newGraftMap().graftPage()` (un map por origen: fuentes e imágenes compartidas se
  copian una vez), aplica `/Rotate`, crea un marcador por documento (`outlineIterator().insert`) y verifica
  páginas y texto de muestra. Los enlaces internos entre páginas del origen no se conservan todavía.
- Worker: `compose(jobId, spec, onProgress)`; todos los orígenes deben estar abiertos en el **mismo** worker,
  por eso `features/merge/engine.ts` usa un worker propio en vez del pool del compresor.
- UI: `store.ts` (orígenes con miniaturas, secuencia, selección, trabajo), `SourceStrip` (páginas
  arrastrables + casilla), `OutputBoard` (`@dnd-kit/sortable`, gaps «+» para insertar la selección),
  `MergeBar` (opciones: nombre, marcadores, comprimir al terminar). Accesible: la selección + «insertar aquí»
  es la ruta de teclado; el tablero se reordena con espacio y flechas.

## Anatomía de una herramienta

```
packages/schema/src/<tool>.ts        zod: <Tool>Spec (opciones) + <Tool>Result (reporte) + eventos
packages/engine/src/<tool>/…         función pura sobre MuPDF.js: (doc, spec, onProgress, signal) → bytes + result
packages/engine/src/worker/          método Comlink expuesto por engine.worker.ts (open/analyze/<tool>/renderPage/close)
apps/web/src/features/<tool>/        Page.tsx · SettingsPanel.tsx · store.ts (Zustand) · presets.ts
apps/web/src/routes/<tool>.tsx       ruta TanStack (file-based) → Page
apps/web/src/components/app/Header.tsx   entrada en `TOOLS` (label, to, ready)
apps/web/container/src/<tool>.ts     (opcional) etapa nativa en la nube: Ghostscript/qpdf/ocrmypdf
```

Regla: la herramienta **no** toca MuPDF desde React. Todo pasa por el worker (`EnginePool`), que ya
gestiona memoria, cancelación por `AbortController` y progreso (`ProgressEvent` con `stage`, `progress`,
`message`, `current/total`).

## Qué se reutiliza tal cual

| Pieza | Dónde | Uso |
|---|---|---|
| Dropzone (`components/app/Dropzone.tsx`), `lib/download.ts` | compartidos ya | entrada de archivos (props `hint`, `badge`), descarga y ZIP |
| FileCard, CompareViewer, HistoryList | `features/compress/` | tarjetas, comparador antes/después, historial (aún específicos del compresor) |
| `EnginePool` | `features/compress/engine-pool.ts` | hasta 3 workers; un archivo vive en un worker; `direct()` para llamadas fuera del pool |
| Perfiles e historial | `profiles.ts`, `history.ts` | localStorage / IndexedDB; parametrizar por `toolId` |
| Descarga y ZIP | `download.ts` | `fflate` para lotes |
| Nube | `cloud.ts` + `worker/api/*` + `worker/do/*` | subida multipart, cola FIFO, WebSocket, descarga firmada 24 h |
| Verificación | `packages/engine/src/pdf/verify.ts` | páginas, texto, SSIM de página, anotaciones/formularios/marcadores |
| Helpers PDF seguros | `packages/engine/src/pdf/objects.ts` | acceso a objetos sin resolver streams (ver ARCHITECTURE.md) |

## Qué hay que generalizar al añadir la segunda herramienta

1. **Spec de trabajo en la nube**: `JobState`, `RunJobPayload` y `CreateJobRequest` llevan hoy `spec: CompressionSpec`.
   Pasar a una unión discriminada `ToolSpec = z.discriminatedUnion("tool", [CompressionSpec, MergeSpec, …])`
   y que `container/src/job.ts` despache por `spec.tool`.
2. **Historial**: la fila guarda `preset` y `savings`; añadir `tool` y un `summary` libre.
3. **Store**: `features/compress/store.ts` mezcla cola local, nube y UI. La cola y la nube se extraen a
   `features/shared/queue.ts` (por archivo: `status`, `progress`, `stage`, `error`, `cancel()`), y cada
   herramienta aporta solo `run(entry, spec)`.
4. **Header**: `TOOLS` pasa de constante a registro (`tools/registry.ts`) con `{ id, to, label, icon, ready, description }`
   para generar también la portada del hub.
5. **Historial**: Unir no guarda historial todavía (los PDF unidos viven solo en memoria hasta descargarlos).

## Checklist para una herramienta nueva

- [ ] Schema zod con defaults (`.prefault({})` en objetos anidados) y `formatX` helpers si hacen falta.
- [ ] Función del motor con test en `packages/engine/test` (fixtures en `test/fixtures.ts`), verificación
      de salida (páginas/texto/interactividad según aplique) y regla "nunca devolver algo peor".
- [ ] Método Comlink en `engine.worker.ts` con `AbortController` por job y liberación de documentos.
- [ ] Ruta + Page + SettingsPanel con componentes Polen (`components/ds`), copy en español, a11y (axe en e2e).
- [ ] Entrada en `Header.tsx` (`ready: true`) y en `README.md`.
- [ ] Si necesita nube: etapa en `container/src/stages.ts` con timeout y kill del grupo de procesos,
      y reporte de progreso vía `worker-client.ts`.
- [ ] e2e Playwright: flujo feliz + cancelación. Bench si cambia el motor.
