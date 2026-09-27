import { formatBytes } from "@prensa/schema";
import { useState } from "react";
import { Download, FileText, Refresh, Trash } from "@/components/app/icons";
import { Alert } from "@/components/ds/alert";
import { Badge } from "@/components/ds/badge";
import { Button } from "@/components/ds/button";
import { Input } from "@/components/ds/input";
import { Progress } from "@/components/ds/progress";
import { Skeleton } from "@/components/ds/skeleton";
import { Tooltip } from "@/components/ds/tooltip";
import { BreakdownBar } from "./BreakdownBar";
import { downloadUrl } from "./download";
import { DOC_TYPE_LABEL, FEATURE_FLAGS, STAGE_LABEL, formatPercent } from "./presets";
import { useCompressStore, type FileEntry } from "./store";

export function FileCard({ entry }: { entry: FileEntry }) {
  const preset = useCompressStore((s) => s.spec.preset);
  const removeFile = useCompressStore((s) => s.removeFile);
  const compressOne = useCompressStore((s) => s.compressOne);
  const unlock = useCompressStore((s) => s.unlock);
  const [password, setPassword] = useState("");

  const report = entry.report;
  const estimate = report?.estimates[preset];
  const busy = entry.status === "opening" || entry.status === "analyzing" || entry.status === "compressing";

  return (
    <article
      aria-label={entry.name}
      className="flex gap-4 rounded-2xl border border-border bg-bg-elevated p-4 transition-shadow duration-(--ds-duration-fast) hover:shadow-sm"
    >
      {/* Miniatura */}
      <div className="hidden w-20 shrink-0 sm:block">
        <div className="flex aspect-[3/4] items-center justify-center overflow-hidden rounded-md border border-border-subtle bg-surface">
          {entry.thumbnailUrl ? (
            <img src={entry.thumbnailUrl} alt="" className="h-full w-full object-contain" />
          ) : busy ? (
            <Skeleton variant="rect" width="100%" height="100%" />
          ) : (
            <FileText className="size-7 text-icon-subtle" />
          )}
        </div>
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-3">
        {/* Cabecera */}
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-md font-semibold text-fg" title={entry.name}>
              {entry.name}
            </h3>
            <p className="text-sm text-fg-muted">
              <span className="tabular">{formatBytes(entry.size)}</span>
              {entry.pageCount != null && <> · {entry.pageCount} {entry.pageCount === 1 ? "página" : "páginas"}</>}
              {report && <> · {DOC_TYPE_LABEL[report.docType]}</>}
              {report && report.images.length > 0 && (
                <> · {report.images.length} {report.images.length === 1 ? "imagen" : "imágenes"}</>
              )}
            </p>
          </div>
          <Tooltip content="Quitar de la lista">
            <Button
              variant="text"
              size="sm"
              radius="semi"
              iconOnly={<Trash />}
              aria-label={`Quitar ${entry.name}`}
              onClick={() => removeFile(entry.id)}
            />
          </Tooltip>
        </div>

        {/* Flags */}
        {report && (
          <ul className="flex flex-wrap gap-1.5" aria-label="Características">
            {FEATURE_FLAGS.filter((f) => report.features[f.key]).map((f) => (
              <li key={f.key}>
                <Badge size="sm" variant={f.tone === "warning" ? "fill" : "tonal"} className={f.tone === "warning" ? "bg-warning text-warning-fg" : ""}>
                  {f.label}
                </Badge>
              </li>
            ))}
          </ul>
        )}

        {/* Estado */}
        {entry.status === "opening" && <Progress value={null} size="sm" label="Abriendo…" />}
        {entry.status === "analyzing" && <Progress value={null} size="sm" label="Analizando estructura e imágenes…" />}

        {entry.status === "password" && (
          <form
            className="flex flex-col gap-2 sm:flex-row sm:items-end"
            onSubmit={(e) => {
              e.preventDefault();
              void unlock(entry.id, password);
            }}
          >
            <Input
              size="sm"
              type="password"
              label="Este PDF está protegido"
              placeholder="Contraseña"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              error={entry.error ?? undefined}
              className="flex-1"
            />
            <Button type="submit" variant="tonal" size="sm" radius="semi" disabled={!password}>
              Desbloquear
            </Button>
          </form>
        )}

        {entry.status === "ready" && report && (
          <div className="flex flex-col gap-2">
            <BreakdownBar breakdown={report.breakdown} total={report.fileSize} />
            {estimate && (
              <p className="text-sm text-fg-muted">
                Estimado con este preset:{" "}
                <span className="tabular font-medium text-fg">{formatBytes(estimate.bytes)}</span>{" "}
                <span className="tabular text-success-text">−{formatPercent(estimate.savings)}</span>
              </p>
            )}
            {report.warnings.length > 0 && (
              <Alert color="warning" size="sm" role="none">
                {report.warnings[0]}
              </Alert>
            )}
          </div>
        )}

        {entry.status === "compressing" && entry.progress && (
          <Progress
            value={Math.round(entry.progress.progress * 100)}
            size="sm"
            showValue
            label={
              entry.progress.current && entry.progress.total
                ? `${STAGE_LABEL[entry.progress.stage]} · ${entry.progress.current}/${entry.progress.total}`
                : STAGE_LABEL[entry.progress.stage]
            }
          />
        )}

        {entry.status === "done" && entry.result && (
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <p className="text-lg">
                <span className="tabular text-fg-muted line-through decoration-fg-subtle">{formatBytes(entry.result.originalSize)}</span>{" "}
                <span aria-hidden className="text-fg-subtle">→</span>{" "}
                <span className="tabular font-semibold text-fg">{formatBytes(entry.result.outputSize)}</span>
              </p>
              {entry.result.savings > 0 ? (
                <Badge variant="tonal" size="md" className="bg-success-subtle text-success-text">
                  −{formatPercent(entry.result.savings)}
                </Badge>
              ) : (
                <Badge variant="tonal" size="md">
                  sin cambios
                </Badge>
              )}
              <span className="text-sm text-fg-subtle tabular">
                {(entry.result.durationMs / 1000).toLocaleString("es", { maximumFractionDigits: 1 })} s
              </span>
            </div>
            {entry.result.returnedOriginal ? (
              <Alert color="info" size="sm" role="none" title="Ya estaba optimizado">
                {entry.result.notes[entry.result.notes.length - 1]}
              </Alert>
            ) : (
              <p className="text-sm text-fg-muted">
                {entry.result.imagesRecompressed} de {entry.result.imagesTotal} imágenes recomprimidas
                {entry.result.imagesDownsampled > 0 && <>, {entry.result.imagesDownsampled} redimensionadas</>}
                {entry.result.fontsSubset && <>, fuentes reducidas</>}
                {entry.result.verification.pageSsimMin != null && (
                  <> · fidelidad de página {(entry.result.verification.pageSsimMin * 100).toFixed(1)} %</>
                )}
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <Button
                variant="fill"
                size="sm"
                radius="semi"
                iconLeft={<Download />}
                onClick={() => entry.outputUrl && downloadUrl(entry.outputUrl, entry.outputName ?? entry.name)}
              >
                Descargar
              </Button>
              <Button variant="text" size="sm" radius="semi" iconLeft={<Refresh />} onClick={() => void compressOne(entry.id)}>
                Recomprimir con los ajustes actuales
              </Button>
            </div>
          </div>
        )}

        {entry.status === "error" && (
          <Alert
            color="danger"
            size="sm"
            title="No se pudo procesar"
            action={
              <Button variant="text" size="sm" radius="semi" onClick={() => void compressOne(entry.id)}>
                Reintentar
              </Button>
            }
          >
            {entry.error}
          </Alert>
        )}
      </div>
    </article>
  );
}
