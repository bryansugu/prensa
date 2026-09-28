import { formatBytes } from "@prensa/schema";
import { useEffect, useRef } from "react";
import { Download } from "@/components/app/icons";
import { Button } from "@/components/ds/button";
import { Input } from "@/components/ds/input";
import { Popover } from "@/components/ds/popover";
import { Progress } from "@/components/ds/progress";
import { Switch } from "@/components/ds/switch";
import { useToast } from "@/components/ds/toast";
import { downloadUrl } from "@/lib/download";
import { outputName, useMergeStore } from "./store";

export function MergeBar() {
  const sequence = useMergeStore((s) => s.sequence);
  const sources = useMergeStore((s) => s.sources);
  const options = useMergeStore((s) => s.options);
  const setOption = useMergeStore((s) => s.setOption);
  const job = useMergeStore((s) => s.job);
  const compose = useMergeStore((s) => s.compose);
  const cancel = useMergeStore((s) => s.cancel);
  const toast = useToast();

  const distinct = new Set(sequence.map((p) => p.source)).size;
  const name = outputName({ sources, options });
  const busy = job.status === "composing" || job.status === "compressing";

  const prev = useRef(job.status);
  useEffect(() => {
    if (prev.current === job.status) return;
    if (job.status === "done" && job.result) {
      toast({
        title: "PDF unido",
        description: `${job.result.pageCount} páginas · ${formatBytes(job.result.size)}`,
        color: "success",
      });
    } else if (job.status === "error") {
      toast({ title: "No se pudo unir", description: job.error ?? undefined, color: "danger" });
    }
    prev.current = job.status;
  }, [job, toast]);

  const result = job.result;
  const compression = result?.compression;

  return (
    <div className="sticky bottom-0 z-30 border-t border-border-subtle bg-bg/85 backdrop-blur supports-[backdrop-filter]:bg-bg/70">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-3 sm:px-6">
        <p className="text-sm text-fg-muted" aria-live="polite">
          <span className="font-semibold text-fg tabular">{sequence.length}</span> {sequence.length === 1 ? "página" : "páginas"} de{" "}
          <span className="font-semibold text-fg tabular">{distinct}</span> {distinct === 1 ? "documento" : "documentos"}
        </p>
        <Popover
          trigger={
            <Button variant="stroke" size="md">
              Opciones
            </Button>
          }
          title="Opciones del resultado"
          size="lg"
          side="top"
          align="start"
        >
          <Input
            size="sm"
            label="Nombre del archivo"
            placeholder={name}
            value={options.name}
            onChange={(e) => setOption("name", e.target.value)}
          />
          <Switch
            size="sm"
            label="Marcadores por documento"
            supporting="Uno por PDF, en su primera página del resultado"
            checked={options.bookmarks}
            onCheckedChange={(checked) => setOption("bookmarks", checked)}
          />
          <Switch
            size="sm"
            label="Comprimir al terminar"
            supporting="Pasa el resultado por el compresor (preset Inteligente)"
            checked={options.compress}
            onCheckedChange={(checked) => setOption("compress", checked)}
          />
        </Popover>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          {busy ? (
            <>
              <div className="w-44 sm:w-56">
                <Progress size="sm" value={Math.round(job.progress * 100)} label={job.message || "Trabajando"} />
              </div>
              <Button variant="text" size="md" onClick={cancel}>
                Cancelar
              </Button>
            </>
          ) : job.status === "done" && result ? (
            <>
              <p className="text-sm text-fg-muted">
                <span className="tabular">{formatBytes(result.size)}</span>
                {compression && !compression.returnedOriginal && <> · −{Math.round(compression.savings * 100)} %</>}
                {result.compose.bookmarks > 0 && <> · {result.compose.bookmarks} marcadores</>}
              </p>
              <Button variant="fill" size="lg" iconLeft={<Download />} onClick={() => downloadUrl(result.url, result.name)}>
                Descargar {result.name}
              </Button>
            </>
          ) : (
            <Button variant="fill" size="lg" disabled={sequence.length === 0} onClick={() => void compose()}>
              Unir {sequence.length} {sequence.length === 1 ? "página" : "páginas"}
            </Button>
          )}
        </div>
      </div>
      {job.status === "error" && job.error && (
        <p role="alert" className="mx-auto max-w-6xl px-4 pb-3 text-sm text-danger-text sm:px-6">
          {job.error}
        </p>
      )}
    </div>
  );
}
