# Herramientas (tool modules) — cómo añadir la siguiente

Prensa v1 tiene una sola herramienta (Comprimir), pero el código está partido para que la
segunda (Unir, Dividir, Rotar, OCR…) sea una carpeta nueva y no una reescritura. Este documento
fija el contrato.

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
| Dropzone, FileCard, CompareViewer, HistoryList | `features/compress/` → mover a `components/app/` al crear la 2.ª herramienta | entrada de archivos, tarjetas, comparador antes/después, historial |
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
