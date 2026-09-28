import { formatBytes } from "@prensa/schema";
import { useState } from "react";
import { Archive } from "@/components/app/icons";
import { Button } from "@/components/ds/button";
import { downloadBlob, zipFiles } from "@/lib/download";
import { formatPercent } from "./presets";
import { selectTotals, useCompressStore } from "./store";

export function ResultSummary() {
  const files = useCompressStore((s) => s.files);
  const preset = useCompressStore((s) => s.spec.preset);
  const clear = useCompressStore((s) => s.clear);
  const [zipping, setZipping] = useState(false);
  const totals = selectTotals(files, preset);
  if (totals.done === 0) return null;

  const done = files.filter((f) => f.status === "done" && f.outputUrl);
  const doneOriginal = done.reduce((a, f) => a + f.size, 0);
  const savings = doneOriginal > 0 ? 1 - totals.output / doneOriginal : 0;

  const downloadZip = async () => {
    setZipping(true);
    try {
      const blob = await zipFiles(done.map((f) => ({ name: f.outputName ?? f.name, url: f.outputUrl! })));
      downloadBlob(blob, "prensa-comprimidos.zip");
    } finally {
      setZipping(false);
    }
  };

  return (
    <section
      aria-label="Resumen"
      className="flex flex-col gap-3 rounded-2xl border border-success-border bg-success-faint p-4 sm:flex-row sm:items-center sm:justify-between"
    >
      <div>
        <p className="text-md font-semibold text-fg">
          {totals.done} {totals.done === 1 ? "archivo listo" : "archivos listos"}
        </p>
        <p className="text-sm text-fg-muted">
          <span className="tabular">{formatBytes(doneOriginal)}</span> <span aria-hidden>→</span>{" "}
          <span className="tabular font-medium text-fg">{formatBytes(totals.output)}</span>{" "}
          <span className="tabular text-success-text">−{formatPercent(Math.max(0, savings))}</span>
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {done.length > 1 && (
          <Button variant="fill" size="md" radius="semi" iconLeft={<Archive />} loading={zipping} onClick={() => void downloadZip()}>
            Descargar todo (ZIP)
          </Button>
        )}
        <Button variant="stroke" size="md" radius="semi" onClick={clear}>
          Limpiar lista
        </Button>
      </div>
    </section>
  );
}
