import { PRESETS, formatBytes, type PresetId } from "@prensa/schema";
import { useState } from "react";
import { Trash } from "@/components/app/icons";
import { Accordion, AccordionItem } from "@/components/ds/accordion";
import { Button } from "@/components/ds/button";
import { Input } from "@/components/ds/input";
import { Select } from "@/components/ds/select";
import { Switch } from "@/components/ds/switch";
import { cn } from "@/lib/cn";
import { PRESET_META, formatPercent } from "./presets";
import { useProfilesStore } from "./profiles";
import { selectTotals, useCompressStore } from "./store";
import { useCloudConfig } from "./useCloudConfig";

const DPI_OPTIONS = [
  { value: "auto", label: "Según el preset" },
  ...[72, 96, 110, 150, 200, 300, 600].map((d) => ({ value: String(d), label: `${d} dpi` })),
];
const QUALITY_OPTIONS = [
  { value: "auto", label: "Según el preset" },
  ...[50, 60, 70, 75, 80, 85, 90, 95].map((q) => ({ value: String(q), label: `${q}` })),
];

export function SettingsPanel() {
  const spec = useCompressStore((s) => s.spec);
  const files = useCompressStore((s) => s.files);
  const setSpec = useCompressStore((s) => s.setSpec);
  const setPreset = useCompressStore((s) => s.setPreset);
  const resetSpec = useCompressStore((s) => s.resetSpec);
  const profiles = useProfilesStore((s) => s.profiles);
  const saveProfile = useProfilesStore((s) => s.save);
  const removeProfile = useProfilesStore((s) => s.remove);
  const [profileName, setProfileName] = useState("");
  const cloudConfig = useCloudConfig();
  const cloudAccessCode = useCompressStore((s) => s.cloudAccessCode);
  const setCloudAccessCode = useCompressStore((s) => s.setCloudAccessCode);
  const cloud = spec.cloud;
  const setCloud = (patch: Partial<typeof cloud>) => setSpec((s) => ({ ...s, cloud: { ...s.cloud, ...patch } }));

  const estimateFor = (preset: PresetId) => selectTotals(files, preset);
  const anyReady = files.some((f) => f.report);

  return (
    <div className="flex flex-col gap-6">
      <section aria-labelledby="presets-title" className="flex flex-col gap-3">
        <div>
          <h2 id="presets-title" className="text-lg font-semibold text-fg">
            Nivel de compresión
          </h2>
          <p className="text-sm text-fg-muted">Cada imagen se verifica con SSIM: si pierde calidad visible, se sube la calidad.</p>
        </div>
        <div role="radiogroup" aria-labelledby="presets-title" className="grid gap-2">
          {PRESET_META.map((meta) => {
            const selected = spec.preset === meta.id;
            const totals = estimateFor(meta.id);
            const Icon = meta.icon;
            const def = PRESETS[meta.id];
            return (
              <button
                key={meta.id}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => setPreset(meta.id)}
                className={cn(
                  "flex items-start gap-3 rounded-xl border p-3 text-left transition-colors duration-(--ds-duration-fast) ease-move outline-none",
                  "focus-visible:shadow-[0_0_0_2px_var(--bg),0_0_0_4px_var(--focus-ring)]",
                  selected
                    ? "border-primary-border-strong bg-primary-faint"
                    : "border-border bg-bg-elevated hover:border-border-strong hover:bg-bg-subtle",
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    "mt-0.5 grid size-8 shrink-0 place-items-center rounded-full text-[18px]",
                    selected ? "bg-primary text-primary-fg" : "bg-surface text-icon-muted",
                  )}
                >
                  <Icon />
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="text-sm font-semibold text-fg">{meta.label}</span>
                    {anyReady && totals.ready > 0 && (
                      <span className="tabular shrink-0 text-xs text-fg-muted">
                        ≈ {formatBytes(totals.estimated)}{" "}
                        <span className="text-success-text">−{formatPercent(1 - totals.estimated / Math.max(1, totals.original))}</span>
                      </span>
                    )}
                  </span>
                  <span className="text-xs text-fg-muted">{meta.description}</span>
                  {def.photoQuality != null && (
                    <span className="mt-1 text-xs text-fg-subtle">
                      JPEG {def.photoQuality} · SSIM ≥ {def.minSsim.toFixed(2)}
                    </span>
                  )}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <Accordion variant="divider" toggle="chevron" size="sm">
        <AccordionItem title="Imágenes">
          <div className="flex flex-col gap-3 pb-2">
            <Select
              size="sm"
              label="Color"
              value={spec.images.color}
              onValueChange={(v) => v && setSpec((s) => ({ ...s, images: { ...s.images, color: v as typeof s.images.color } }))}
              options={[
                { value: "keep", label: "Mantener colores" },
                { value: "grayscale", label: "Escala de grises" },
                { value: "bilevel", label: "Blanco y negro (1 bit)" },
              ]}
            />
            <Select
              size="sm"
              label="Resolución objetivo"
              value={spec.images.colorDpi == null ? "auto" : String(spec.images.colorDpi)}
              onValueChange={(v) =>
                setSpec((s) => ({ ...s, images: { ...s.images, colorDpi: !v || v === "auto" ? null : Number(v) } }))
              }
              options={DPI_OPTIONS}
            />
            <Select
              size="sm"
              label="Calidad JPEG"
              value={spec.images.jpegQuality == null ? "auto" : String(spec.images.jpegQuality)}
              onValueChange={(v) =>
                setSpec((s) => ({ ...s, images: { ...s.images, jpegQuality: !v || v === "auto" ? null : Number(v) } }))
              }
              options={QUALITY_OPTIONS}
            />
            <Switch
              size="sm"
              label="Blanco y negro automático en escaneos de texto"
              supporting="Umbral adaptativo: mucho más liviano, sin grises"
              checked={spec.scan.bilevel === "auto"}
              onCheckedChange={(checked) => setSpec((s) => ({ ...s, scan: { ...s.scan, bilevel: checked ? "auto" : "off" } }))}
            />
          </div>
        </AccordionItem>

        <AccordionItem title="Conservar">
          <div className="flex flex-col gap-3 pb-2">
            {(
              [
                ["links", "Enlaces"],
                ["forms", "Formularios rellenables"],
                ["annotations", "Comentarios y anotaciones"],
                ["bookmarks", "Marcadores"],
                ["tags", "Etiquetas de accesibilidad"],
                ["layers", "Capas"],
                ["attachments", "Archivos adjuntos"],
                ["encryption", "Cifrado existente"],
              ] as const
            ).map(([key, label]) => (
              <Switch
                key={key}
                size="sm"
                label={label}
                checked={spec.preserve[key]}
                onCheckedChange={(checked) => setSpec((s) => ({ ...s, preserve: { ...s.preserve, [key]: checked } }))}
              />
            ))}
          </div>
        </AccordionItem>

        <AccordionItem title="Eliminar">
          <div className="flex flex-col gap-3 pb-2">
            <Select
              size="sm"
              label="Metadatos"
              value={spec.remove.metadata}
              onValueChange={(v) => v && setSpec((s) => ({ ...s, remove: { ...s.remove, metadata: v as typeof s.remove.metadata } }))}
              options={[
                { value: "basic", label: "Solo título, autor y asunto" },
                { value: "keep", label: "Conservar todo" },
                { value: "none", label: "Eliminar todo" },
              ]}
            />
            {(
              [
                ["thumbnails", "Miniaturas embebidas"],
                ["javascript", "JavaScript y acciones automáticas"],
                ["pieceInfo", "Datos privados de aplicaciones (Illustrator, InDesign…)"],
                ["xfa", "Datos XFA duplicados en formularios (el formulario sigue funcionando)"],
                ["structureTree", "Estructura de accesibilidad"],
              ] as const
            ).map(([key, label]) => (
              <Switch
                key={key}
                size="sm"
                label={label}
                checked={spec.remove[key]}
                onCheckedChange={(checked) => setSpec((s) => ({ ...s, remove: { ...s.remove, [key]: checked } }))}
              />
            ))}
          </div>
        </AccordionItem>

        <AccordionItem title="Aplanar">
          <div className="flex flex-col gap-3 pb-2">
            <Switch
              size="sm"
              label="Aplanar formularios"
              supporting="Los campos dejan de ser editables y quedan como dibujo"
              checked={spec.flatten.forms}
              onCheckedChange={(checked) => setSpec((s) => ({ ...s, flatten: { ...s.flatten, forms: checked } }))}
            />
            <Switch
              size="sm"
              label="Aplanar anotaciones"
              checked={spec.flatten.annotations}
              onCheckedChange={(checked) => setSpec((s) => ({ ...s, flatten: { ...s.flatten, annotations: checked } }))}
            />
            <Switch
              size="sm"
              label="Rasterizar todo (cada página → imagen)"
              supporting="Compresión extrema: se pierde el texto seleccionable"
              checked={spec.mode === "rasterize"}
              onCheckedChange={(checked) => setSpec((s) => ({ ...s, mode: checked ? "rasterize" : "preserve" }))}
            />
          </div>
        </AccordionItem>

        <AccordionItem title="Salida">
          <div className="flex flex-col gap-3 pb-2">
            <Input
              size="sm"
              label="Nombre del archivo"
              hint="{original} se reemplaza por el nombre original"
              value={spec.output.namePattern}
              onChange={(e) => setSpec((s) => ({ ...s, output: { ...s.output, namePattern: e.target.value || "{original}-comprimido" } }))}
            />
            <Input
              size="sm"
              type="number"
              inputMode="decimal"
              min={0.1}
              step={0.1}
              label="Objetivo de tamaño (MB, opcional)"
              hint="Prueba presets cada vez más agresivos hasta caber"
              value={spec.output.targetSizeBytes ? String(Math.round((spec.output.targetSizeBytes / 1024 / 1024) * 10) / 10) : ""}
              onChange={(e) => {
                const mb = Number(e.target.value);
                setSpec((s) => ({ ...s, output: { ...s.output, targetSizeBytes: Number.isFinite(mb) && mb > 0 ? Math.round(mb * 1024 * 1024) : null } }));
              }}
            />
          </div>
        </AccordionItem>

        <AccordionItem title={cloud.enabled ? "Nube · activa" : "Nube"}>
          <div className="flex min-w-0 flex-col gap-3 pb-2 [&_*]:min-w-0">
            {cloudConfig === null ? (
              <p className="text-sm text-fg-muted">La nube no está disponible en este entorno.</p>
            ) : (
              <>
                <Switch
                  size="sm"
                  label="Procesar en la nube (Cloudflare)"
                  supporting={`OCR, JBIG2 y archivos enormes (hasta ${formatBytes(cloudConfig.maxBytes)}). Se sube cifrado, se procesa y se borra a las ${cloudConfig.ttlHours} h.`}
                  checked={cloud.enabled}
                  onCheckedChange={(checked) => setCloud({ enabled: checked })}
                />
                {cloud.enabled && (
                  <>
                    {cloudConfig.requiresAccessCode && (
                      <Input
                        size="sm"
                        type="password"
                        label="Código de acceso"
                        hint="Esta nube es privada: pide el código a quien la administra"
                        value={cloudAccessCode}
                        onChange={(e) => setCloudAccessCode(e.target.value)}
                      />
                    )}
                    <Select
                      size="sm"
                      label="Motor"
                      value={cloud.engine}
                      onValueChange={(v) => v && setCloud({ engine: v as typeof cloud.engine })}
                      options={[
                        { value: "auto", label: "Automático (conserva interactividad)" },
                        { value: "ghostscript", label: "Ghostscript (aplana formularios)" },
                        { value: "rasterize", label: "Rasterizar (página → imagen)" },
                      ]}
                    />
                    <Switch
                      size="sm"
                      label="OCR: texto seleccionable"
                      supporting="Tesseract 5 añade una capa de texto invisible"
                      checked={cloud.ocr.enabled}
                      onCheckedChange={(checked) => setCloud({ ocr: { ...cloud.ocr, enabled: checked } })}
                    />
                    {cloud.ocr.enabled && (
                      <>
                        <Select
                          size="sm"
                          multiple
                          label="Idiomas del OCR"
                          value={cloud.ocr.languages}
                          onValueChange={(v) => setCloud({ ocr: { ...cloud.ocr, languages: v.length ? v : ["spa"] } })}
                          options={cloudConfig.ocrLanguages.map((l) => ({ value: l.code, label: l.label }))}
                        />
                        <Select
                          size="sm"
                          label="Páginas"
                          value={cloud.ocr.mode}
                          onValueChange={(v) => v && setCloud({ ocr: { ...cloud.ocr, mode: v as typeof cloud.ocr.mode } })}
                          options={[
                            { value: "skip-text", label: "Solo las que no tienen texto" },
                            { value: "force", label: "Todas (rehacer el texto existente)" },
                          ]}
                        />
                        <Switch
                          size="sm"
                          label="Enderezar y rotar páginas escaneadas"
                          checked={cloud.ocr.deskew}
                          onCheckedChange={(checked) => setCloud({ ocr: { ...cloud.ocr, deskew: checked, rotate: checked } })}
                        />
                      </>
                    )}
                    <Switch
                      size="sm"
                      label="JBIG2 para escaneos en B/N"
                      supporting="2–4× más pequeño que CCITT"
                      checked={cloud.jbig2}
                      onCheckedChange={(checked) => setCloud({ jbig2: checked })}
                    />
                    <Switch
                      size="sm"
                      label="Linealizar (vista web rápida)"
                      checked={cloud.linearize}
                      onCheckedChange={(checked) => setCloud({ linearize: checked })}
                    />
                    <p className="text-xs text-fg-muted">
                      El resultado queda descargable 24 h y luego se borra; puedes eliminarlo antes desde la tarjeta.
                    </p>
                  </>
                )}
              </>
            )}
          </div>
        </AccordionItem>

        <AccordionItem title={profiles.length ? `Perfiles (${profiles.length})` : "Perfiles"}>
          <div className="flex flex-col gap-3 pb-2">
            {profiles.length > 0 && (
              <ul className="flex flex-col gap-1" aria-label="Perfiles guardados">
                {profiles.map((p) => (
                  <li key={p.id} className="flex items-center gap-2">
                    <Button
                      variant="tonal"
                      size="sm"
                      radius="semi"
                      className="min-w-0 flex-1 justify-start"
                      onClick={() => setSpec(() => p.spec)}
                      title={`Aplicar «${p.name}»`}
                    >
                      <span className="truncate">{p.name}</span>
                    </Button>
                    <Button
                      variant="text"
                      size="sm"
                      radius="semi"
                      iconOnly={<Trash />}
                      aria-label={`Eliminar perfil ${p.name}`}
                      onClick={() => removeProfile(p.id)}
                    />
                  </li>
                ))}
              </ul>
            )}
            <form
              className="flex items-end gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (!profileName.trim()) return;
                saveProfile(profileName, spec);
                setProfileName("");
              }}
            >
              <Input
                size="sm"
                label="Guardar los ajustes actuales como"
                placeholder="p. ej. Para clientes"
                value={profileName}
                onChange={(e) => setProfileName(e.target.value)}
                className="flex-1"
              />
              <Button type="submit" variant="stroke" size="sm" radius="semi" disabled={!profileName.trim()}>
                Guardar
              </Button>
            </form>
          </div>
        </AccordionItem>
      </Accordion>

      <div>
        <Button variant="text" size="sm" radius="semi" onClick={resetSpec}>
          Restablecer ajustes
        </Button>
      </div>
    </div>
  );
}
