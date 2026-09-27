/**
 * Comparador antes/después: renderiza la misma página del original y del
 * resultado (ambos abiertos en el worker) y permite deslizar, ver lado a lado
 * y ampliar. Las páginas se cachean por (página, zoom).
 */
import { formatBytes } from "@prensa/schema";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight } from "@/components/ds/icons";
import { Button } from "@/components/ds/button";
import { Modal, ModalBody, ModalHeader } from "@/components/ds/modal";
import { Spinner } from "@/components/ds/spinner";
import { Tab, TabList, Tabs } from "@/components/ds/tabs";
import { cn } from "@/lib/cn";
import { pool } from "./engine-pool";
import { formatPercent } from "./presets";
import type { FileEntry } from "./store";

type Mode = "slider" | "side";
const ZOOMS = [1, 2, 4] as const;
type Zoom = (typeof ZOOMS)[number];

interface Rendered {
  before: string;
  after: string;
  width: number;
  height: number;
}

interface Props {
  entry: FileEntry;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CompareViewer({ entry, open, onOpenChange }: Props) {
  const pageCount = entry.pageCount ?? 1;
  const [page, setPage] = useState(0);
  const [zoom, setZoom] = useState<Zoom>(1);
  const [mode, setMode] = useState<Mode>("slider");
  const [split, setSplit] = useState(50);
  const [rendered, setRendered] = useState<Rendered | null>(null);
  const [loading, setLoading] = useState(false);
  const cache = useRef(new Map<string, Rendered>());

  const key = `${page}:${zoom}`;

  const render = useCallback(async () => {
    const cached = cache.current.get(key);
    if (cached) {
      setRendered(cached);
      return;
    }
    setLoading(true);
    try {
      const scale = 1.5 * zoom; // 108 dpi × zoom
      const [a, b] = await pool.run(entry.slot, (api) =>
        Promise.all([api.renderPage(entry.id, page, scale), api.renderPage(`${entry.id}:out`, page, scale)]),
      );
      const r: Rendered = {
        before: URL.createObjectURL(new Blob([a.png as BlobPart], { type: "image/png" })),
        after: URL.createObjectURL(new Blob([b.png as BlobPart], { type: "image/png" })),
        width: a.width,
        height: a.height,
      };
      cache.current.set(key, r);
      setRendered(r);
    } catch {
      setRendered(null);
    } finally {
      setLoading(false);
    }
  }, [entry.id, entry.slot, key, page, zoom]);

  useEffect(() => {
    if (open) void render();
  }, [open, render]);

  // Liberar object URLs al cerrar/desmontar.
  useEffect(() => {
    const c = cache.current;
    return () => {
      for (const r of c.values()) {
        URL.revokeObjectURL(r.before);
        URL.revokeObjectURL(r.after);
      }
      c.clear();
    };
  }, []);

  const result = entry.result;
  const subtitle = useMemo(
    () =>
      result
        ? `${formatBytes(result.originalSize)} → ${formatBytes(result.outputSize)} · −${formatPercent(result.savings)}`
        : undefined,
    [result],
  );

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowLeft" && page > 0) setPage(page - 1);
    if (e.key === "ArrowRight" && page < pageCount - 1) setPage(page + 1);
  };

  const imgClass = zoom === 1 ? "w-full" : "max-w-none";

  return (
    <Modal open={open} onOpenChange={onOpenChange} size="lg">
      <ModalHeader title={`Comparar · ${entry.name}`} subtitle={subtitle} />
      <ModalBody className="flex min-h-0 flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3" onKeyDown={onKey}>
          <div className="flex items-center gap-1">
            <Button
              variant="tonal"
              size="sm"
              radius="semi"
              iconOnly={<ArrowLeft />}
              aria-label="Página anterior"
              disabled={page === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
            />
            <span className="tabular min-w-24 text-center text-sm text-fg-muted" aria-live="polite">
              Página {page + 1} de {pageCount}
            </span>
            <Button
              variant="tonal"
              size="sm"
              radius="semi"
              iconOnly={<ArrowRight />}
              aria-label="Página siguiente"
              disabled={page >= pageCount - 1}
              onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
            />
          </div>
          <Tabs value={mode} onValueChange={(v) => setMode(v as Mode)} variant="segmented" size="sm" radius="semi">
            <TabList aria-label="Modo de comparación">
              <Tab value="slider">Deslizar</Tab>
              <Tab value="side">Lado a lado</Tab>
            </TabList>
          </Tabs>
          <div role="group" aria-label="Zoom" className="ml-auto flex items-center gap-1">
            {ZOOMS.map((z) => (
              <Button key={z} variant={zoom === z ? "fill" : "text"} size="sm" radius="semi" aria-pressed={zoom === z} onClick={() => setZoom(z)}>
                {z}×
              </Button>
            ))}
          </div>
        </div>

        <div className="relative min-h-64 flex-1 overflow-auto rounded-xl border border-border bg-surface">
          {loading && (
            <div className="absolute inset-0 z-10 grid place-items-center bg-bg/60">
              <Spinner size="lg" label="Renderizando" />
            </div>
          )}
          {rendered && mode === "side" && (
            <div className="grid grid-cols-2 gap-2 p-2">
              <figure className="min-w-0">
                <img src={rendered.before} alt={`Original, página ${page + 1}`} className={cn(imgClass, "block")} />
                <figcaption className="mt-1 text-center text-xs text-fg-muted">Original</figcaption>
              </figure>
              <figure className="min-w-0">
                <img src={rendered.after} alt={`Comprimido, página ${page + 1}`} className={cn(imgClass, "block")} />
                <figcaption className="mt-1 text-center text-xs text-fg-muted">Comprimido</figcaption>
              </figure>
            </div>
          )}
          {rendered && mode === "slider" && (
            <div className="relative inline-block min-w-full">
              <img src={rendered.after} alt={`Comprimido, página ${page + 1}`} className={cn(imgClass, "block")} draggable={false} />
              <img
                src={rendered.before}
                alt={`Original, página ${page + 1}`}
                className={cn(imgClass, "absolute inset-0 block")}
                style={{ clipPath: `inset(0 ${100 - split}% 0 0)` }}
                draggable={false}
              />
              <div aria-hidden className="pointer-events-none absolute inset-y-0 w-0.5 bg-primary" style={{ left: `${split}%` }} />
              <span aria-hidden className="pointer-events-none absolute top-2 left-2 rounded-full bg-bg-elevated/90 px-2 py-0.5 text-xs font-medium text-fg shadow-xs">
                Original
              </span>
              <span aria-hidden className="pointer-events-none absolute top-2 right-2 rounded-full bg-bg-elevated/90 px-2 py-0.5 text-xs font-medium text-fg shadow-xs">
                Comprimido
              </span>
              <input
                type="range"
                min={0}
                max={100}
                value={split}
                onChange={(e) => setSplit(Number(e.target.value))}
                aria-label="Posición del comparador (izquierda original, derecha comprimido)"
                className="absolute inset-0 h-full w-full cursor-col-resize opacity-0"
              />
            </div>
          )}
          {!rendered && !loading && (
            <p className="p-6 text-center text-sm text-fg-muted">No se pudo renderizar esta página.</p>
          )}
        </div>
      </ModalBody>
    </Modal>
  );
}
