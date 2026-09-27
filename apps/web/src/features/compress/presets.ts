import type { DocFeatures, DocType, ImageKind, PresetId, Stage } from "@prensa/schema";
import type { ComponentType, SVGProps } from "react";
import { Archive, Feather, ImageIcon, Monitor, Printer, Shield, Sparkles } from "@/components/app/icons";

export interface PresetMeta {
  id: PresetId;
  label: string;
  description: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
}

/** Orden de presentación en la UI. */
export const PRESET_META: PresetMeta[] = [
  { id: "smart", label: "Inteligente", description: "Decide por imagen: máximo ahorro sin pérdida visible.", icon: Sparkles },
  { id: "balanced", label: "Equilibrado", description: "150 dpi · compartir y uso general.", icon: Feather },
  { id: "screen", label: "Pantalla", description: "110 dpi · correo y lectura en pantalla.", icon: Monitor },
  { id: "print", label: "Impresión", description: "220 dpi · imprimir en oficina.", icon: Printer },
  { id: "maximum", label: "Máxima fidelidad", description: "300 dpi · imprenta y archivo.", icon: ImageIcon },
  { id: "lossless", label: "Sin pérdida", description: "Solo limpieza: ni un píxel cambia.", icon: Shield },
  { id: "minimum", label: "Mínimo", description: "80 dpi · cuando el límite de tamaño manda.", icon: Archive },
];

export const DOC_TYPE_LABEL: Record<DocType, string> = {
  text: "Texto",
  scanned: "Escaneado",
  mixed: "Mixto",
  presentation: "Presentación",
  vector: "Vectorial",
  image: "Imágenes",
  empty: "Vacío",
};

export const IMAGE_KIND_LABEL: Record<ImageKind, string> = {
  photo: "foto",
  graphic: "gráfico",
  scan: "escaneo",
  bilevel: "1 bit",
  tiny: "diminuta",
  mask: "máscara",
  unknown: "imagen",
};

export const STAGE_LABEL: Record<Stage, string> = {
  open: "Abriendo",
  analyze: "Analizando",
  images: "Recomprimiendo imágenes",
  fonts: "Reduciendo fuentes",
  cleanup: "Limpiando estructura",
  save: "Guardando",
  verify: "Verificando calidad",
  upload: "Subiendo",
  queued: "En cola",
  processing: "Procesando",
  download: "Descargando",
  done: "Listo",
};

export interface FeatureFlag {
  key: keyof DocFeatures;
  label: string;
  tone: "neutral" | "warning" | "info";
}

export const FEATURE_FLAGS: FeatureFlag[] = [
  { key: "forms", label: "Formularios", tone: "info" },
  { key: "links", label: "Enlaces", tone: "neutral" },
  { key: "annotations", label: "Comentarios", tone: "neutral" },
  { key: "bookmarks", label: "Marcadores", tone: "neutral" },
  { key: "tagged", label: "Accesible", tone: "neutral" },
  { key: "layers", label: "Capas", tone: "neutral" },
  { key: "attachments", label: "Adjuntos", tone: "neutral" },
  { key: "signatures", label: "Firmado", tone: "warning" },
  { key: "encrypted", label: "Cifrado", tone: "warning" },
  { key: "javascript", label: "JavaScript", tone: "neutral" },
];

export function formatPercent(fraction: number): string {
  const pct = fraction * 100;
  // Un decimal por debajo del 10 % y por encima del 99 % (para no mostrar "100 %" cuando no lo es).
  const digits = pct < 10 || (pct > 99 && pct < 100) ? 1 : 0;
  return `${pct.toLocaleString("es", { maximumFractionDigits: digits, minimumFractionDigits: digits })} %`;
}
