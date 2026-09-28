/**
 * Detección de memoria del navegador y presupuesto del motor local.
 *
 * `navigator.deviceMemory` (Chrome/Edge) devuelve GiB redondeados y topados
 * en 8; Firefox y Safari no lo exponen, así que se estima por tipo de
 * dispositivo. Con eso se fijan los límites de tamaño para procesar en local
 * y se estima si un archivo concreto cabe antes de intentarlo.
 */
export interface MemoryProfile {
  /** GiB reportados por el navegador; null si no los expone */
  deviceGiB: number | null;
  source: "deviceMemory" | "mobile" | "default";
  /** Memoria aproximada que el motor puede usar (bytes) */
  budget: number;
  /** A partir de aquí se avisa y se ofrece la nube */
  softLimit: number;
  /** A partir de aquí no se abre en el navegador */
  hardLimit: number;
}

export interface MemorySignals {
  deviceMemory?: number | undefined;
  mobile: boolean;
}

const MiB = 1024 ** 2;
const GiB = 1024 ** 3;
/** Tope práctico del heap WASM de MuPDF en navegadores de escritorio. */
const WASM_CAP = 2 * GiB;
/** iOS/Android limitan la memoria WASM por pestaña bastante por debajo de la RAM. */
const MOBILE_CAP = 1 * GiB;
const HARD_CAP = 400 * MiB;
const SOFT_CAP = 150 * MiB;

export function readSignals(nav: Navigator = navigator): MemorySignals {
  const n = nav as Navigator & { deviceMemory?: number; userAgentData?: { mobile?: boolean } };
  const ua = n.userAgent ?? "";
  const mobile =
    n.userAgentData?.mobile ??
    (/Android|iPhone|iPad|iPod|Mobile/i.test(ua) || (n.maxTouchPoints > 1 && /Macintosh/i.test(ua))); // iPadOS se presenta como Mac
  return { deviceMemory: typeof n.deviceMemory === "number" && n.deviceMemory > 0 ? n.deviceMemory : undefined, mobile };
}

export function profileFromSignals(s: MemorySignals): MemoryProfile {
  let deviceGiB: number | null = null;
  let source: MemoryProfile["source"];
  let budget: number;
  if (s.deviceMemory) {
    deviceGiB = s.deviceMemory;
    source = "deviceMemory";
    // ~35 % de la RAM para el motor: el resto es el navegador, el SO y el propio archivo en JS.
    budget = Math.min(WASM_CAP, s.deviceMemory * GiB * 0.35);
  } else if (s.mobile) {
    source = "mobile";
    budget = 0.9 * GiB;
  } else {
    source = "default";
    budget = 1.5 * GiB;
  }
  if (s.mobile) budget = Math.min(budget, MOBILE_CAP);
  return {
    deviceGiB,
    source,
    budget,
    hardLimit: Math.min(HARD_CAP, Math.floor(budget / 4)),
    softLimit: Math.min(SOFT_CAP, Math.floor(budget / 10)),
  };
}

let cached: MemoryProfile | null = null;

export function memoryProfile(): MemoryProfile {
  cached ??= typeof navigator === "undefined" ? profileFromSignals({ mobile: false }) : profileFromSignals(readSignals());
  return cached;
}

/**
 * Memoria aproximada que necesita el motor para un archivo: varias copias del
 * PDF (entrada, documento parseado, salida) más la imagen más grande
 * decodificada en RGBA con sus buffers de redimensionado y verificación.
 */
export function estimateLocalMemoryNeed(fileSize: number, largestImagePixels: number): number {
  return 64 * MiB + fileSize * 3.5 + largestImagePixels * 4 * 3;
}

/** ¿El error viene de quedarse sin memoria (JS, WASM o MuPDF)? */
export function isMemoryError(err: unknown): boolean {
  const raw = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
  return /out of memory|memory|allocation failed|Array buffer allocation|Cannot enlarge|Aborted\(|unreachable|\bOOM\b|WORKER_CRASHED/i.test(raw);
}

/** Tras un abort del módulo WASM el worker queda inutilizable: hay que recrearlo. */
export function isFatalEngineError(err: unknown): boolean {
  const raw = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
  return /Cannot enlarge|Aborted\(|unreachable|memory access out of bounds|WORKER_CRASHED|RuntimeError/i.test(raw);
}
