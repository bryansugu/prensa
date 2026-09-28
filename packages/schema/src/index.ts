/**
 * @prensa/schema — contratos compartidos entre el motor local (navegador),
 * la UI, el Worker de Cloudflare y el motor en la nube.
 *
 * Todo lo que cruza una frontera (worker ↔ UI, cliente ↔ API, API ↔ contenedor)
 * se valida con estos esquemas.
 */
import { z } from "zod";

// ───────────────────────────── Presets ─────────────────────────────

export const PRESET_IDS = [
  "smart",
  "lossless",
  "maximum",
  "print",
  "balanced",
  "screen",
  "minimum",
] as const;
export const PresetId = z.enum(PRESET_IDS);
export type PresetId = z.infer<typeof PresetId>;

export interface PresetDefinition {
  id: PresetId;
  /** DPI objetivo para imágenes en color/gris (null = no redimensionar) */
  colorDpi: number | null;
  /** DPI objetivo para imágenes bilevel (1 bpc) */
  monoDpi: number | null;
  /** Calidad JPEG para fotos (null = no recomprimir con pérdida) */
  photoQuality: number | null;
  /** Calidad JPEG para gráficos/capturas con muchos colores */
  graphicQuality: number | null;
  /** Submuestreo de crominancia permitido */
  chroma: "444" | "420";
  /** SSIM mínimo aceptable por imagen (luma, vs. original redimensionado) */
  minSsim: number;
  /** Convertir CMYK → RGB (uso pantalla) */
  cmykToRgb: boolean;
}

export const PRESETS: Record<PresetId, PresetDefinition> = {
  smart: {
    id: "smart",
    colorDpi: 150,
    monoDpi: 400,
    photoQuality: 75,
    graphicQuality: 82,
    chroma: "420",
    minSsim: 0.94,
    cmykToRgb: true,
  },
  lossless: {
    id: "lossless",
    colorDpi: null,
    monoDpi: null,
    photoQuality: null,
    graphicQuality: null,
    chroma: "444",
    minSsim: 1,
    cmykToRgb: false,
  },
  maximum: {
    id: "maximum",
    colorDpi: 300,
    monoDpi: 600,
    photoQuality: 92,
    graphicQuality: 95,
    chroma: "444",
    minSsim: 0.98,
    cmykToRgb: false,
  },
  print: {
    id: "print",
    colorDpi: 220,
    monoDpi: 600,
    photoQuality: 85,
    graphicQuality: 90,
    chroma: "444",
    minSsim: 0.96,
    cmykToRgb: false,
  },
  balanced: {
    id: "balanced",
    colorDpi: 150,
    monoDpi: 400,
    photoQuality: 75,
    graphicQuality: 82,
    chroma: "420",
    minSsim: 0.94,
    cmykToRgb: true,
  },
  screen: {
    id: "screen",
    colorDpi: 110,
    monoDpi: 300,
    photoQuality: 62,
    graphicQuality: 72,
    chroma: "420",
    minSsim: 0.9,
    cmykToRgb: true,
  },
  minimum: {
    id: "minimum",
    colorDpi: 80,
    monoDpi: 200,
    photoQuality: 50,
    graphicQuality: 62,
    chroma: "420",
    minSsim: 0.85,
    cmykToRgb: true,
  },
};

// ───────────────────────────── Spec ─────────────────────────────

export const ColorMode = z.enum(["keep", "grayscale", "bilevel"]);
export type ColorMode = z.infer<typeof ColorMode>;

export const ChromaMode = z.enum(["auto", "444", "420"]);

export const ImageOptions = z.object({
  /** null → usa el preset */
  colorDpi: z.number().int().min(36).max(1200).nullable().default(null),
  monoDpi: z.number().int().min(72).max(2400).nullable().default(null),
  /** null → usa el preset (foto); gráficos = +8 */
  jpegQuality: z.number().int().min(20).max(100).nullable().default(null),
  chroma: ChromaMode.default("auto"),
  color: ColorMode.default("keep"),
  /** null → usa el preset */
  minSsim: z.number().min(0.5).max(1).nullable().default(null),
  /** Solo redimensiona si dpiEfectivo > dpiObjetivo × umbral */
  downsampleThreshold: z.number().min(1).max(4).default(1.15),
  /** Imágenes ya en JPEG con calidad estimada ≤ este valor no se recomprimen */
  keepJpegBelowQuality: z.number().int().min(0).max(100).default(0),
});
export type ImageOptions = z.infer<typeof ImageOptions>;

export const PreserveOptions = z.object({
  links: z.boolean().default(true),
  forms: z.boolean().default(true),
  annotations: z.boolean().default(true),
  bookmarks: z.boolean().default(true),
  tags: z.boolean().default(true),
  layers: z.boolean().default(true),
  attachments: z.boolean().default(true),
  encryption: z.boolean().default(true),
});
export type PreserveOptions = z.infer<typeof PreserveOptions>;

export const MetadataMode = z.enum(["keep", "basic", "none"]);

export const RemoveOptions = z.object({
  thumbnails: z.boolean().default(true),
  javascript: z.boolean().default(true),
  pieceInfo: z.boolean().default(true),
  alternates: z.boolean().default(true),
  /**
   * Paquetes XFA de formularios híbridos (AcroForm + XFA, típico de formularios
   * oficiales hechos con Adobe LiveCycle). Duplican el formulario; sin ellos el
   * AcroForm sigue funcionando en cualquier visor. Nunca se tocan los XFA
   * dinámicos (NeedsRendering), que sí dependen de ellos.
   */
  xfa: z.boolean().default(true),
  /** keep = todo; basic = solo título/autor/asunto; none = nada (incluye XMP) */
  metadata: MetadataMode.default("basic"),
  structureTree: z.boolean().default(false),
});
export type RemoveOptions = z.infer<typeof RemoveOptions>;

export const FlattenOptions = z.object({
  forms: z.boolean().default(false),
  annotations: z.boolean().default(false),
});

export const ScanOptions = z.object({
  /** Umbral adaptativo (Sauvola) para convertir escaneos de texto a 1 bpc */
  bilevel: z.enum(["off", "auto", "force"]).default("off"),
});

export const CloudEngine = z.enum(["auto", "mutool", "ghostscript", "rasterize"]);

export const CloudOptions = z.object({
  enabled: z.boolean().default(false),
  engine: CloudEngine.default("auto"),
  ocr: z
    .object({
      enabled: z.boolean().default(false),
      languages: z.array(z.string().min(2).max(8)).default(["spa"]),
      mode: z.enum(["skip-text", "force"]).default("skip-text"),
      deskew: z.boolean().default(false),
      rotate: z.boolean().default(false),
    })
    .prefault({}),
  jbig2: z.boolean().default(false),
  mrc: z.boolean().default(false),
  linearize: z.boolean().default(false),
  pdfa: z.boolean().default(false),
});

export const OutputOptions = z.object({
  /** {original} se reemplaza por el nombre sin extensión */
  namePattern: z.string().min(1).max(200).default("{original}-comprimido"),
  /** Objetivo de tamaño en bytes (búsqueda automática de parámetros) */
  targetSizeBytes: z.number().int().positive().nullable().default(null),
});

export const CompressionSpec = z.object({
  preset: PresetId.default("smart"),
  /** preserve = recomprimir in-place; rasterize = cada página → imagen */
  mode: z.enum(["preserve", "rasterize"]).default("preserve"),
  images: ImageOptions.prefault({}),
  preserve: PreserveOptions.prefault({}),
  remove: RemoveOptions.prefault({}),
  flatten: FlattenOptions.prefault({}),
  scan: ScanOptions.prefault({}),
  cloud: CloudOptions.prefault({}),
  output: OutputOptions.prefault({}),
  /** Contraseña del documento si está cifrado */
  password: z.string().max(256).optional(),
});
export type CompressionSpec = z.infer<typeof CompressionSpec>;
export type CompressionSpecInput = z.input<typeof CompressionSpec>;

export function defaultSpec(preset: PresetId = "smart"): CompressionSpec {
  return CompressionSpec.parse({ preset });
}

/** Resuelve los parámetros efectivos de imagen combinando preset + overrides. */
export function resolveImageParams(spec: CompressionSpec): PresetDefinition {
  const base = PRESETS[spec.preset];
  const o = spec.images;
  const photoQuality = o.jpegQuality ?? base.photoQuality;
  return {
    ...base,
    colorDpi: o.colorDpi ?? base.colorDpi,
    monoDpi: o.monoDpi ?? base.monoDpi,
    photoQuality,
    graphicQuality:
      o.jpegQuality != null ? Math.min(100, o.jpegQuality + 8) : base.graphicQuality,
    chroma: o.chroma === "auto" ? base.chroma : o.chroma,
    minSsim: o.minSsim ?? base.minSsim,
  };
}

// ───────────────────────────── Análisis ─────────────────────────────

export const ImageKind = z.enum(["photo", "graphic", "scan", "bilevel", "tiny", "mask", "unknown"]);
export type ImageKind = z.infer<typeof ImageKind>;

export const ImageInfo = z.object({
  /** Número de objeto PDF (identidad estable dentro del archivo) */
  objectNumber: z.number().int(),
  width: z.number().int(),
  height: z.number().int(),
  bitsPerComponent: z.number().int(),
  components: z.number().int(),
  colorSpace: z.string(),
  filter: z.string().nullable(),
  bytes: z.number().int(),
  hasSoftMask: z.boolean(),
  isStencilMask: z.boolean(),
  /** Tamaño dibujado máximo en puntos (1/72 in) en todas sus apariciones */
  drawnWidthPt: z.number().nullable(),
  drawnHeightPt: z.number().nullable(),
  /** DPI efectivo mínimo observado (= el que manda para no perder detalle) */
  effectiveDpi: z.number().nullable(),
  occurrences: z.number().int(),
  kind: ImageKind,
});
export type ImageInfo = z.infer<typeof ImageInfo>;

export const DocType = z.enum(["text", "scanned", "mixed", "presentation", "vector", "image", "empty"]);
export type DocType = z.infer<typeof DocType>;

export const DocFeatures = z.object({
  forms: z.boolean(),
  signatures: z.boolean(),
  links: z.boolean(),
  annotations: z.boolean(),
  bookmarks: z.boolean(),
  javascript: z.boolean(),
  layers: z.boolean(),
  attachments: z.boolean(),
  tagged: z.boolean(),
  pieceInfo: z.boolean(),
  thumbnails: z.boolean(),
  xmp: z.boolean(),
  encrypted: z.boolean(),
  incrementalUpdates: z.number().int(),
});
export type DocFeatures = z.infer<typeof DocFeatures>;

export const SizeBreakdown = z.object({
  images: z.number().int(),
  fonts: z.number().int(),
  content: z.number().int(),
  metadata: z.number().int(),
  other: z.number().int(),
});
export type SizeBreakdown = z.infer<typeof SizeBreakdown>;

export const PresetEstimate = z.object({
  bytes: z.number().int(),
  /** 0..1, fracción del original que se ahorra */
  savings: z.number(),
});
export type PresetEstimate = z.infer<typeof PresetEstimate>;

export const AnalysisReport = z.object({
  fileName: z.string(),
  fileSize: z.number().int(),
  pageCount: z.number().int(),
  pdfVersion: z.string().nullable(),
  docType: DocType,
  textPages: z.number().int(),
  imageOnlyPages: z.number().int(),
  images: z.array(ImageInfo),
  fonts: z.object({
    count: z.number().int(),
    embedded: z.number().int(),
    subset: z.number().int(),
    bytes: z.number().int(),
  }),
  breakdown: SizeBreakdown,
  features: DocFeatures,
  estimates: z.record(PresetId, PresetEstimate),
  warnings: z.array(z.string()),
  durationMs: z.number(),
});
export type AnalysisReport = z.infer<typeof AnalysisReport>;

// ───────────────────────────── Resultado ─────────────────────────────

export const Verification = z.object({
  pagesOk: z.boolean(),
  textOk: z.boolean(),
  /** SSIM mínimo de las páginas de muestra renderizadas antes/después */
  pageSsimMin: z.number().nullable(),
  interactivityOk: z.boolean(),
});
export type Verification = z.infer<typeof Verification>;

export const CompressionResult = z.object({
  originalSize: z.number().int(),
  outputSize: z.number().int(),
  /** 0..1 fracción ahorrada (0 si se devolvió el original) */
  savings: z.number(),
  durationMs: z.number(),
  preset: PresetId,
  imagesTotal: z.number().int(),
  imagesRecompressed: z.number().int(),
  imagesDownsampled: z.number().int(),
  fontsSubset: z.boolean(),
  breakdown: z.object({
    before: SizeBreakdown,
    after: SizeBreakdown,
  }),
  verification: Verification,
  /** true si el resultado no era menor y se entregó el original */
  returnedOriginal: z.boolean(),
  notes: z.array(z.string()),
});
export type CompressionResult = z.infer<typeof CompressionResult>;

// ───────────────────────────── Progreso ─────────────────────────────

export const Stage = z.enum([
  "open",
  "analyze",
  "images",
  "fonts",
  "cleanup",
  "save",
  "verify",
  "upload",
  "queued",
  "processing",
  "download",
  "done",
]);
export type Stage = z.infer<typeof Stage>;

export const ProgressEvent = z.object({
  stage: Stage,
  /** 0..1 dentro del trabajo completo */
  progress: z.number().min(0).max(1),
  message: z.string().optional(),
  current: z.number().int().optional(),
  total: z.number().int().optional(),
});
export type ProgressEvent = z.infer<typeof ProgressEvent>;

// ───────────────────────────── Nube ─────────────────────────────

export const JobStatus = z.enum(["queued", "running", "done", "failed", "cancelled", "expired"]);
export type JobStatus = z.infer<typeof JobStatus>;

export const JobState = z.object({
  id: z.string().uuid(),
  status: JobStatus,
  position: z.number().int().nullable(),
  stage: Stage.nullable(),
  progress: z.number().min(0).max(1),
  message: z.string().nullable(),
  fileName: z.string(),
  outputName: z.string().nullable(),
  inputSize: z.number().int(),
  result: CompressionResult.nullable(),
  /** Ruta relativa de descarga firmada (válida hasta expiresAt) */
  downloadUrl: z.string().nullable(),
  error: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  expiresAt: z.string().nullable(),
});
export type JobState = z.infer<typeof JobState>;

/** Configuración pública de la nube que la UI consulta al cargar. */
export const CloudConfig = z.object({
  enabled: z.boolean(),
  maxBytes: z.number().int(),
  partSize: z.number().int(),
  requiresAccessCode: z.boolean(),
  ocrLanguages: z.array(z.object({ code: z.string(), label: z.string() })),
  ttlHours: z.number().int(),
});
export type CloudConfig = z.infer<typeof CloudConfig>;

export const UploadInitRequest = z.object({
  fileName: z.string().min(1).max(255),
  size: z.number().int().positive(),
  accessCode: z.string().max(128).optional(),
});
export type UploadInitRequest = z.infer<typeof UploadInitRequest>;

export const UploadInitResponse = z.object({
  uploadId: z.string(),
  key: z.string(),
  partSize: z.number().int(),
});
export type UploadInitResponse = z.infer<typeof UploadInitResponse>;

export const UploadCompleteRequest = z.object({
  key: z.string().min(1),
  parts: z.array(z.object({ partNumber: z.number().int().positive(), etag: z.string() })).min(1),
});
export type UploadCompleteRequest = z.infer<typeof UploadCompleteRequest>;

/** Payload que el Worker envía al contenedor para ejecutar un trabajo. */
export const RunJobPayload = z.object({
  jobId: z.string().uuid(),
  /** URL base del Worker a la que el contenedor reporta y de la que lee/escribe objetos */
  callbackUrl: z.string().url(),
  inputKey: z.string(),
  outputKey: z.string(),
  fileName: z.string(),
  inputSize: z.number().int(),
  spec: CompressionSpec,
});
export type RunJobPayload = z.infer<typeof RunJobPayload>;

export const JobProgressReport = z.object({
  stage: Stage,
  progress: z.number().min(0).max(1),
  message: z.string().optional(),
});
export const JobDoneReport = z.object({
  result: CompressionResult,
  outputKey: z.string(),
});
export const JobFailedReport = z.object({ error: z.string().max(2000) });

export const OCR_LANGUAGES = [
  { code: "spa", label: "Español" },
  { code: "eng", label: "Inglés" },
  { code: "por", label: "Portugués" },
  { code: "fra", label: "Francés" },
  { code: "deu", label: "Alemán" },
  { code: "ita", label: "Italiano" },
  { code: "cat", label: "Catalán" },
] as const;

export const CreateJobRequest = z.object({
  uploadKey: z.string().min(1),
  fileName: z.string().min(1).max(255),
  inputSize: z.number().int().positive(),
  spec: CompressionSpec,
  accessCode: z.string().max(128).optional(),
});
export type CreateJobRequest = z.infer<typeof CreateJobRequest>;

// ───────────────────────────── Unir / componer páginas ─────────────────────────────

export const Rotation = z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]);
export type Rotation = z.infer<typeof Rotation>;

/** Una página del resultado: de qué documento (id abierto en el worker), qué página y giro extra. */
export const ComposePageRef = z.object({
  source: z.string().min(1),
  page: z.number().int().min(0),
  rotate: Rotation.default(0),
});
export type ComposePageRef = z.infer<typeof ComposePageRef>;

export const ComposeSpec = z.object({
  pages: z.array(ComposePageRef).min(1).max(10_000),
  /** Un marcador por documento de origen, en su primera aparición (solo si hay ≥ 2 documentos). */
  bookmarks: z.boolean().default(true),
  title: z.string().max(300).optional(),
});
export type ComposeSpec = z.infer<typeof ComposeSpec>;
export type ComposeSpecInput = z.input<typeof ComposeSpec>;

export const ComposeResult = z.object({
  pageCount: z.number().int(),
  sources: z.number().int(),
  outputSize: z.number().int(),
  durationMs: z.number().int(),
  bookmarks: z.number().int(),
  verification: z.object({ pagesOk: z.boolean(), textOk: z.boolean() }),
  notes: z.array(z.string()),
});
export type ComposeResult = z.infer<typeof ComposeResult>;

// ───────────────────────────── Utilidades ─────────────────────────────

export function outputFileName(pattern: string, originalName: string): string {
  const base = originalName.replace(/\.pdf$/i, "");
  const resolved = pattern.replace(/\{original\}/g, base).trim() || `${base}-comprimido`;
  return /\.pdf$/i.test(resolved) ? resolved : `${resolved}.pdf`;
}

export function formatBytes(bytes: number, locale = "es"): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i++;
  }
  const digits = i === 0 ? 0 : value < 10 ? 2 : value < 100 ? 1 : 0;
  return `${value.toLocaleString(locale, { maximumFractionDigits: digits, minimumFractionDigits: digits })} ${units[i]}`;
}
