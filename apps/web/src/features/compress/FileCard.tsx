import { formatBytes } from "@prensa/schema";
import { useState } from "react";
import { Cloud, Download, FileText, Refresh, Scan, Trash } from "@/components/app/icons";
import { Alert } from "@/components/ds/alert";
import { Badge } from "@/components/ds/badge";
import { Button } from "@/components/ds/button";
import { Input } from "@/components/ds/input";
import { Progress } from "@/components/ds/progress";
import { Skeleton } from "@/components/ds/skeleton";
import { Tooltip } from "@/components/ds/tooltip";
import { BreakdownBar } from "./BreakdownBar";
import { CompareViewer } from "./CompareViewer";
import { downloadUrl } from "./download";
import { DOC_TYPE_LABEL, FEATURE_FLAGS, STAGE_LABEL, formatPercent } from "./presets";
import { LOCAL_SOFT_LIMIT, useCompressStore, type FileEntry } from "./store";

export function FileCard({ entry }: { entry: FileEntry }) {
  const preset = useCompressStore((s) => s.spec.preset);
  const removeFile = useCompressStore((s) => s.removeFile);
  const compressOne = useCompressStore((s) => s.compressOne);
  const unlock = useCompressStore((s) => s.unlock);
  const cancel = useCompressStore((s) => s.cancel);
  const deleteFromCloud = useCompressStore((s) => s.deleteFromCloud);
  const cloudEnabled = useCompressStore((s) => s.spec.cloud.enabled);
  const setForceCloud = useCompressStore((s) => s.setForceCloud);
  const processInCloud = useCompressStore((s) => s.processInCloud);
  const [password, setPassword] = useState("");
  const [compareOpen, setCompareOpen] = useState(false);

  const report = entry.report;
  const estimate = report?.estimates[preset];
  const busy = entry.status === "opening" || entry.status === "analyzing" || entry.status === "compressing" || entry.status === "uploading" || entry.status === "cloud";
  const isCloudResult = entry.status === "done" && entry.cloud != null;
  const expired = entry.cloud?.status === "expired";

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

        {entry.status === "ready" && entry.tooLargeForLocal && (
          <Alert
            color="warning"
            size="sm"
            role="none"
            title="Demasiado grande para el navegador"
            action={
              <Button
                variant="tonal"
                size="sm"
                radius="semi"
                onClick={() => {
                  setForceCloud(entry.id, true);
                  void processInCloud(entry.id);
                }}
              >
                Procesar en la nube
              </Button>
            }
          >
            Más de 400 MB no caben en la memoria del navegador. En la nube se procesa hasta 2 GB; el archivo se sube cifrado y se borra a las 24 h.
          </Alert>
        )}

        {entry.status === "ready" && report && (
          <div className="flex flex-col gap-2">
            {entry.size > LOCAL_SOFT_LIMIT && !cloudEnabled && !entry.forceCloud && (
              <p className="text-sm text-fg-muted">
                Archivo grande: en el navegador puede tardar varios minutos.{" "}
                <button
                  type="button"
                  className="font-medium text-primary-accent underline-offset-2 hover:underline"
                  onClick={() => setForceCloud(entry.id, true)}
                >
                  Procesar este archivo en la nube
                </button>
              </p>
            )}
            {entry.forceCloud && !cloudEnabled && (
              <p className="inline-flex items-center gap-1.5 text-sm text-fg-muted">
                <Cloud className="size-4" /> Se procesará en la nube.
              </p>
            )}
            {entry.cancelled && (
              <p className="text-sm text-fg-muted" role="status">
                Compresión cancelada.
              </p>
            )}
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
            {report.docType === "scanned" && !cloudEnabled && (
              <p className="text-sm text-fg-muted">
                Escaneado sin texto: en <span className="font-medium text-fg">Ajustes → Nube</span> puedes añadir OCR y JBIG2.
              </p>
            )}
          </div>
        )}

        {(entry.status === "uploading" || entry.status === "cloud") && entry.progress && (
          <div className="flex items-end gap-3">
            <div className="min-w-0 flex-1">
              <Progress
                value={entry.status === "cloud" && entry.progress.stage === "queued" ? null : Math.round(entry.progress.progress * 100)}
                size="sm"
                showValue={entry.progress.stage !== "queued"}
                label={
                  <span className="inline-flex items-center gap-1.5">
                    <Cloud className="size-4 text-icon-muted" />
                    {entry.progress.message && entry.progress.stage !== "upload" ? entry.progress.message : STAGE_LABEL[entry.progress.stage]}
                  </span>
                }
              />
            </div>
            <Button variant="stroke" size="sm" radius="semi" onClick={() => cancel(entry.id)}>
              Cancelar
            </Button>
          </div>
        )}

        {entry.status === "compressing" && entry.progress && (
          <div className="flex items-end gap-3">
            <div className="min-w-0 flex-1">
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
            </div>
            <Button variant="stroke" size="sm" radius="semi" onClick={() => cancel(entry.id)}>
              Cancelar
            </Button>
          </div>
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
              <span className="text-sm text-fg-muted tabular">
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
                disabled={!entry.outputUrl || expired}
                onClick={() => entry.outputUrl && downloadUrl(entry.outputUrl, entry.outputName ?? entry.name)}
              >
                {expired ? "Archivo eliminado" : "Descargar"}
              </Button>
              {!isCloudResult && (
                <Button variant="stroke" size="sm" radius="semi" iconLeft={<Scan />} onClick={() => setCompareOpen(true)}>
                  Comparar
                </Button>
              )}
              {isCloudResult && !expired && (
                <Button variant="stroke" size="sm" radius="semi" iconLeft={<Trash />} onClick={() => void deleteFromCloud(entry.id)}>
                  Eliminar de la nube
                </Button>
              )}
              <Button variant="text" size="sm" radius="semi" iconLeft={<Refresh />} onClick={() => void compressOne(entry.id)}>
                Recomprimir
              </Button>
            </div>
            {isCloudResult && entry.cloud?.expiresAt && !expired && (
              <p className="inline-flex items-center gap-1.5 text-xs text-fg-subtle">
                <Cloud className="size-3.5" />
                Procesado en la nube · disponible hasta {new Date(entry.cloud.expiresAt).toLocaleString("es")}
              </p>
            )}
            {compareOpen && !isCloudResult && <CompareViewer entry={entry} open={compareOpen} onOpenChange={setCompareOpen} />}
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
