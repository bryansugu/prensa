/** Utilidades seguras sobre PDFObject de MuPDF (nunca lanzan por objetos raros). */
import type { PDFDocument, PDFObject } from "../mupdf";

export function isNullish(o: PDFObject | null | undefined): o is null | undefined {
  return o == null || o.isNull();
}

export function asNumber(o: PDFObject | null | undefined, fallback = 0): number {
  try {
    return !isNullish(o) && o.isNumber() ? o.asNumber() : fallback;
  } catch {
    return fallback;
  }
}

export function asName(o: PDFObject | null | undefined): string | null {
  try {
    if (isNullish(o)) return null;
    if (o.isName()) return o.asName();
    if (!o.isIndirect() || o.isStream()) return null;
    const r = o.resolve();
    return r.isName() ? r.asName() : null;
  } catch {
    return null;
  }
}

export function asBool(o: PDFObject | null | undefined, fallback = false): boolean {
  try {
    return !isNullish(o) && o.isBoolean() ? o.asBoolean() : fallback;
  } catch {
    return fallback;
  }
}

/** Número de objeto si es referencia indirecta; null si es directo. */
export function objectNumber(o: PDFObject | null | undefined): number | null {
  try {
    return !isNullish(o) && o.isIndirect() ? o.asIndirect() : null;
  } catch {
    return null;
  }
}

/**
 * ¿Es un stream? En MuPDF la comprobación solo funciona sobre la referencia
 * indirecta (los streams se identifican por número de objeto), nunca sobre el
 * diccionario ya resuelto.
 */
export function isStreamRef(o: PDFObject | null | undefined): boolean {
  try {
    return !isNullish(o) && o.isStream();
  } catch {
    return false;
  }
}

/**
 * Devuelve un objeto sobre el que se puede leer con get() como diccionario.
 *
 * IMPORTANTE (mupdf.js 1.28.1): llamar a `resolve()` sobre una referencia a un
 * STREAM hace que ese stream se pierda al guardar el documento (verificado con
 * un bisect sobre PDFs reales). Por eso, para streams devolvemos la propia
 * referencia indirecta: `get()`, `isStream()`, `readRawStream()` y
 * `writeRawStream()` resuelven internamente sin ese problema. Solo resolvemos
 * diccionarios/arrays "puros", que sí son seguros.
 */
export function resolveDict(o: PDFObject | null | undefined): PDFObject | null {
  try {
    if (isNullish(o)) return null;
    if (o.isIndirect()) {
      if (o.isStream()) return o;
      const r = o.resolve();
      return r.isDictionary() ? r : null;
    }
    return o.isDictionary() ? o : null;
  } catch {
    return null;
  }
}

export function resolveArray(o: PDFObject | null | undefined): PDFObject | null {
  try {
    if (isNullish(o)) return null;
    if (o.isIndirect()) {
      if (o.isStream()) return null;
      const r = o.resolve();
      return r.isArray() ? r : null;
    }
    return o.isArray() ? o : null;
  } catch {
    return null;
  }
}

export function get(o: PDFObject | null | undefined, ...path: Array<string | number>): PDFObject | null {
  try {
    if (isNullish(o)) return null;
    const v = o.get(...path);
    return isNullish(v) ? null : v;
  } catch {
    return null;
  }
}

export function has(o: PDFObject | null | undefined, key: string): boolean {
  return get(o, key) != null;
}

export function forEachEntry(
  o: PDFObject | null | undefined,
  fn: (value: PDFObject, key: string | number) => void,
): void {
  if (isNullish(o)) return;
  // Nunca resolver streams (ver resolveDict); sus diccionarios no se iteran.
  const d = o.isIndirect() ? (o.isStream() ? null : o.resolve()) : o;
  if (!d) return;
  try {
    d.forEach((val, key) => {
      try {
        fn(val, key);
      } catch {
        /* entrada corrupta: seguir */
      }
    });
  } catch {
    /* no iterable */
  }
}

/** Longitud declarada del stream (bytes codificados) sin leerlo. */
export function streamLength(stream: PDFObject | null | undefined): number {
  const len = asNumber(get(stream, "Length"), -1);
  if (len >= 0) return len;
  try {
    return isStreamRef(stream) ? stream!.readRawStream().getLength() : 0;
  } catch {
    return 0;
  }
}

export function filterNames(stream: PDFObject | null | undefined): string[] {
  const f = get(stream, "Filter");
  if (!f) return [];
  const single = asName(f);
  if (single) return [single];
  const arr = resolveArray(f);
  const names: string[] = [];
  forEachEntry(arr, (v) => {
    const n = asName(v);
    if (n) names.push(n);
  });
  return names;
}

export interface ColorSpaceInfo {
  /** Nombre normalizado: DeviceGray, DeviceRGB, DeviceCMYK, ICCBased, Indexed, Separation, DeviceN, Lab, CalRGB, CalGray, Pattern, Unknown */
  family: string;
  /** Componentes por muestra del stream (Indexed/Separation = 1) */
  components: number;
  /** Para ICCBased/Indexed: familia base (DeviceRGB, DeviceCMYK…) */
  base: string | null;
}

export function colorSpaceInfo(cs: PDFObject | null | undefined): ColorSpaceInfo {
  const unknown: ColorSpaceInfo = { family: "Unknown", components: 1, base: null };
  if (isNullish(cs)) return unknown;
  const n = asName(cs);
  if (n) {
    switch (n) {
      case "DeviceGray":
      case "G":
      case "CalGray":
        return { family: n === "CalGray" ? "CalGray" : "DeviceGray", components: 1, base: null };
      case "DeviceRGB":
      case "RGB":
      case "CalRGB":
        return { family: n === "CalRGB" ? "CalRGB" : "DeviceRGB", components: 3, base: null };
      case "DeviceCMYK":
      case "CMYK":
        return { family: "DeviceCMYK", components: 4, base: null };
      case "Pattern":
        return { family: "Pattern", components: 1, base: null };
      default:
        return { family: n, components: 1, base: null };
    }
  }
  const arr = resolveArray(cs);
  if (!arr) return unknown;
  const family = asName(get(arr, 0)) ?? "Unknown";
  switch (family) {
    case "ICCBased": {
      const stream = resolveDict(get(arr, 1));
      const nComp = asNumber(get(stream, "N"), 3);
      const alt = colorSpaceInfo(get(stream, "Alternate"));
      const base = alt.family !== "Unknown" ? alt.family : nComp === 1 ? "DeviceGray" : nComp === 4 ? "DeviceCMYK" : "DeviceRGB";
      return { family, components: nComp, base };
    }
    case "Indexed":
    case "I": {
      const base = colorSpaceInfo(get(arr, 1));
      return { family: "Indexed", components: 1, base: base.family };
    }
    case "Separation":
      return { family, components: 1, base: colorSpaceInfo(get(arr, 2)).family };
    case "DeviceN": {
      const names = resolveArray(get(arr, 1));
      return { family, components: names ? names.length : 1, base: colorSpaceInfo(get(arr, 2)).family };
    }
    case "Lab":
      return { family, components: 3, base: null };
    case "CalRGB":
      return { family, components: 3, base: null };
    case "CalGray":
      return { family, components: 1, base: null };
    default:
      return { family, components: 1, base: null };
  }
}

/** Info del documento (trailer /Info) como objeto plano de strings. */
export function readInfo(doc: PDFDocument): Record<string, string> {
  const out: Record<string, string> = {};
  const info = resolveDict(get(doc.getTrailer(), "Info"));
  forEachEntry(info, (v, k) => {
    try {
      const r = v.resolve();
      if (r.isString()) out[String(k)] = r.asString();
      else if (r.isName()) out[String(k)] = r.asName();
    } catch {
      /* ignorar */
    }
  });
  return out;
}
