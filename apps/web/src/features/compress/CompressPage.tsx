import { formatBytes } from "@prensa/schema";
import { useEffect, useRef, useState } from "react";
import { Accordion, AccordionItem } from "@/components/ds/accordion";
import { Button } from "@/components/ds/button";
import { Drawer, DrawerBody, DrawerHeader } from "@/components/ds/drawer";
import { Switch } from "@/components/ds/switch";
import { useToast } from "@/components/ds/toast";
import { BRAND } from "@/lib/brand";
import { useMediaQuery } from "@/lib/useMediaQuery";
import { Dropzone } from "@/components/app/Dropzone";
import { pool } from "./engine-pool";
import { FileCard } from "./FileCard";
import { HistoryList } from "./HistoryList";
import { formatPercent } from "./presets";
import { ResultSummary } from "./ResultSummary";
import { SettingsPanel } from "./SettingsPanel";
import { selectTotals, useCompressStore, type FileEntry } from "./store";

/** Muestra un toast cuando un archivo termina o falla. */
function useCompletionToasts() {
  const toast = useToast();
  const seen = useRef(new Map<string, FileEntry["status"]>());
  useEffect(
    () =>
      useCompressStore.subscribe((state) => {
        for (const f of state.files) {
          const prev = seen.current.get(f.id);
          if (prev === "compressing" && f.status === "done" && f.result) {
            toast({
              title: f.result.returnedOriginal ? "Ya estaba optimizado" : `${f.name} listo`,
              description: f.result.returnedOriginal
                ? f.name
                : `${formatBytes(f.result.originalSize)} → ${formatBytes(f.result.outputSize)} · −${formatPercent(f.result.savings)}`,
              color: "success",
            });
          } else if (prev === "compressing" && f.status === "error") {
            toast({ title: `No se pudo comprimir ${f.name}`, description: f.error ?? undefined, color: "danger" });
          }
          seen.current.set(f.id, f.status);
        }
        for (const id of [...seen.current.keys()]) if (!state.files.some((f) => f.id === id)) seen.current.delete(id);
      }),
    [toast],
  );
}

function NotifySwitch() {
  const notify = useCompressStore((s) => s.notify);
  const setNotify = useCompressStore((s) => s.setNotify);
  const supported = typeof Notification !== "undefined";
  if (!supported) return null;
  return (
    <Switch
      size="sm"
      label="Avisarme al terminar"
      supporting="Notificación del sistema si la pestaña está en segundo plano"
      checked={notify}
      onCheckedChange={(checked) => {
        if (!checked) {
          setNotify(false);
          return;
        }
        if (Notification.permission === "granted") setNotify(true);
        else void Notification.requestPermission().then((p) => setNotify(p === "granted"));
      }}
    />
  );
}

export function CompressPage() {
  const files = useCompressStore((s) => s.files);
  const preset = useCompressStore((s) => s.spec.preset);
  const addFiles = useCompressStore((s) => s.addFiles);
  const compressAll = useCompressStore((s) => s.compressAll);
  const cancelAll = useCompressStore((s) => s.cancelAll);
  const desktop = useMediaQuery("(min-width: 1024px)");
  const [settingsOpen, setSettingsOpen] = useState(false);
  useCompletionToasts();

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
  const cloudEnabled = useCompressStore((s) => s.spec.cloud.enabled);
  const compressing = files.some((f) => f.status === "compressing" || f.status === "uploading" || f.status === "cloud");
  const canCompress = totals.ready > 0 && !compressing;
  const estimatedSavings = Math.max(0, 1 - totals.estimated / Math.max(1, totals.original));

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
        <div className="mx-auto w-full max-w-2xl">
          <Accordion variant="divider" toggle="chevron" size="sm">
            <AccordionItem title="Historial">
              <HistoryList />
            </AccordionItem>
          </Accordion>
        </div>
      </section>
    );
  }

  const compressButton = (
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
        ? cloudEnabled
          ? "Procesando en la nube…"
          : "Comprimiendo…"
        : `${cloudEnabled ? "Comprimir en la nube" : "Comprimir"} ${totals.ready} ${totals.ready === 1 ? "archivo" : "archivos"}`}
    </Button>
  );

  const estimateLine = totals.ready > 0 && (
    <p className="text-center text-sm text-fg-muted">
      <span className="tabular">{formatBytes(totals.original)}</span> <span aria-hidden>→</span> ≈{" "}
      <span className="tabular font-medium text-fg">{formatBytes(totals.estimated)}</span>{" "}
      <span className="tabular text-success-text">−{formatPercent(estimatedSavings)}</span>
    </p>
  );

  return (
    <section className="mx-auto grid max-w-6xl gap-8 px-4 py-8 pb-32 sm:px-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start lg:pb-8">
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

      {desktop ? (
        <aside className="flex flex-col gap-5 rounded-2xl border border-border bg-bg-elevated p-5 lg:sticky lg:top-24">
          <SettingsPanel />
          <Accordion variant="divider" toggle="chevron" size="sm">
            <AccordionItem title="Historial">
              <HistoryList />
            </AccordionItem>
          </Accordion>
          <div className="flex flex-col gap-3 border-t border-border-subtle pt-5">
            <NotifySwitch />
            {compressButton}
            {compressing && (
              <Button variant="text" size="sm" radius="semi" fullWidth onClick={cancelAll}>
                Cancelar todo
              </Button>
            )}
            {estimateLine}
          </div>
        </aside>
      ) : (
        <>
          <Drawer side="bottom" open={settingsOpen} onOpenChange={setSettingsOpen}>
            <DrawerHeader title="Ajustes" description="Nivel de compresión y opciones avanzadas" />
            <DrawerBody className="overflow-y-auto px-4 pb-6">
              <SettingsPanel />
              <div className="mt-4 border-t border-border-subtle pt-4">
                <NotifySwitch />
              </div>
              <Accordion variant="divider" toggle="chevron" size="sm" className="mt-4">
                <AccordionItem title="Historial">
                  <HistoryList />
                </AccordionItem>
              </Accordion>
            </DrawerBody>
          </Drawer>
          <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border-subtle bg-bg/90 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur supports-[backdrop-filter]:bg-bg/75">
            <div className="mx-auto flex max-w-6xl flex-col gap-2">
              <div className="flex gap-2">
                <Button variant="stroke" size="lg" radius="semi" onClick={() => setSettingsOpen(true)}>
                  Ajustes
                </Button>
                <div className="min-w-0 flex-1">{compressButton}</div>
              </div>
              {compressing ? (
                <Button variant="text" size="sm" radius="semi" fullWidth onClick={cancelAll}>
                  Cancelar todo
                </Button>
              ) : (
                estimateLine
              )}
            </div>
          </div>
        </>
      )}
    </section>
  );
}
