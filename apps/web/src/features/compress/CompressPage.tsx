import { formatBytes } from "@prensa/schema";
import { useEffect } from "react";
import { Button } from "@/components/ds/button";
import { BRAND } from "@/lib/brand";
import { Dropzone } from "./Dropzone";
import { pool } from "./engine-pool";
import { FileCard } from "./FileCard";
import { formatPercent } from "./presets";
import { ResultSummary } from "./ResultSummary";
import { SettingsPanel } from "./SettingsPanel";
import { selectTotals, useCompressStore } from "./store";

export function CompressPage() {
  const files = useCompressStore((s) => s.files);
  const preset = useCompressStore((s) => s.spec.preset);
  const addFiles = useCompressStore((s) => s.addFiles);
  const compressAll = useCompressStore((s) => s.compressAll);

  // Precalentar el motor (descarga y compila el WASM) mientras el usuario elige archivos.
  useEffect(() => {
    void pool.warmup().catch(() => undefined);
  }, []);

  // Pegar PDFs desde el portapapeles.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const list = e.clipboardData?.files;
      if (list && list.length) addFiles(Array.from(list));
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [addFiles]);

  const totals = selectTotals(files, preset);
  const compressing = files.some((f) => f.status === "compressing");
  const pending = files.filter((f) => f.status === "ready" || f.status === "error").length;
  const canCompress = totals.ready > 0 && !compressing;

  if (files.length === 0) {
    return (
      <section className="mx-auto flex max-w-4xl flex-col gap-10 px-4 py-12 sm:px-6 sm:py-20">
        <div className="flex flex-col gap-4 text-center">
          <h1 className="text-heading-xs font-semibold tracking-tight text-fg sm:text-heading-md">
            Comprime PDF sin perder calidad
          </h1>
          <p className="mx-auto max-w-2xl text-lg text-fg-muted">
            {BRAND.tagline} Conserva enlaces, formularios y marcadores; cada imagen se verifica antes de aceptarla.
          </p>
        </div>
        <Dropzone onFiles={addFiles} />
        <ul className="grid gap-4 text-sm text-fg-muted sm:grid-cols-3">
          <li className="rounded-xl border border-border-subtle bg-bg-subtle p-4">
            <p className="font-semibold text-fg">Privado de verdad</p>
            El motor corre en tu navegador. Funciona incluso sin conexión.
          </li>
          <li className="rounded-xl border border-border-subtle bg-bg-subtle p-4">
            <p className="font-semibold text-fg">Calidad medida</p>
            Cada imagen se compara con la original (SSIM) y nunca sale un archivo más grande.
          </li>
          <li className="rounded-xl border border-border-subtle bg-bg-subtle p-4">
            <p className="font-semibold text-fg">Interactividad intacta</p>
            No reescribimos el documento: enlaces, formularios y etiquetas siguen ahí.
          </li>
        </ul>
      </section>
    );
  }

  return (
    <section className="mx-auto grid max-w-6xl gap-8 px-4 py-8 sm:px-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
      <div className="flex flex-col gap-4">
        <Dropzone compact onFiles={addFiles} />
        <ResultSummary />
        <ul className="flex flex-col gap-3" aria-label="Archivos">
          {files.map((f) => (
            <li key={f.id}>
              <FileCard entry={f} />
            </li>
          ))}
        </ul>
      </div>

      <aside className="flex flex-col gap-5 rounded-2xl border border-border bg-bg-elevated p-5 lg:sticky lg:top-24">
        <SettingsPanel />
        <div className="flex flex-col gap-2 border-t border-border-subtle pt-5">
          <Button
            variant="fill"
            size="lg"
            radius="semi"
            fullWidth
            loading={compressing}
            disabled={!canCompress}
            onClick={() => void compressAll()}
          >
            {compressing
              ? "Comprimiendo…"
              : `Comprimir ${totals.ready} ${totals.ready === 1 ? "archivo" : "archivos"}`}
          </Button>
          {totals.ready > 0 && (
            <p className="text-center text-sm text-fg-muted">
              <span className="tabular">{formatBytes(totals.original)}</span> <span aria-hidden>→</span> ≈{" "}
              <span className="tabular font-medium text-fg">{formatBytes(totals.estimated)}</span>{" "}
              <span className="tabular text-success-text">
                −{formatPercent(Math.max(0, 1 - totals.estimated / Math.max(1, totals.original)))}
              </span>
              {pending === 0 && totals.done > 0 && <> · todo listo</>}
            </p>
          )}
        </div>
      </aside>
    </section>
  );
}
