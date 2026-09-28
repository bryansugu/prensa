/**
 * Limpieza estructural según las opciones "conservar / eliminar / aplanar".
 * Todo lo que no está explícitamente marcado para eliminar se conserva.
 */
import { formatBytes, type CompressionSpec, type DocFeatures } from "@prensa/schema";
import type { PDFDocument, PDFObject } from "../mupdf";
import { asBool, asName, forEachEntry, get, has, objectNumber, resolveArray, resolveDict, streamLength } from "./objects";

const BASIC_INFO_KEYS = new Set(["Title", "Author", "Subject", "Keywords", "CreationDate"]);

export interface CleanupResult {
  notes: string[];
  /** Bytes de archivos adjuntos que se conservaron (0 si no hay o se quitaron). */
  attachmentsBytes: number;
}

export function applyCleanup(doc: PDFDocument, spec: CompressionSpec, features: DocFeatures): CleanupResult {
  const notes: string[] = [];
  const trailer = doc.getTrailer();
  const root = resolveDict(get(trailer, "Root"));
  if (!root) return { notes, attachmentsBytes: 0 };
  const pageCount = doc.countPages();
  const { remove, preserve } = spec;

  // ── Metadatos ────────────────────────────────────────────────────
  if (remove.metadata !== "keep") {
    const info = resolveDict(get(trailer, "Info"));
    if (remove.metadata === "none") {
      safeDelete(trailer, "Info");
      if (features.xmp) notes.push("Metadatos eliminados");
    } else if (info) {
      const keys: string[] = [];
      forEachEntry(info, (_v, k) => keys.push(String(k)));
      for (const k of keys) if (!BASIC_INFO_KEYS.has(k)) safeDelete(info, k);
    }
    if (has(root, "Metadata")) {
      safeDelete(root, "Metadata");
      if (remove.metadata === "basic") notes.push("XMP eliminado (se conservan título/autor)");
    }
  }

  // ── JavaScript / acciones automáticas ────────────────────────────
  if (remove.javascript) {
    const names = resolveDict(get(root, "Names"));
    if (has(names, "JavaScript")) {
      safeDelete(names, "JavaScript");
      notes.push("JavaScript eliminado");
    }
    const openAction = resolveDict(get(root, "OpenAction"));
    if (openAction && asName(get(openAction, "S")) === "JavaScript") safeDelete(root, "OpenAction");
    safeDelete(root, "AA");
  }

  // ── Datos privados de aplicaciones ───────────────────────────────
  // /PieceInfo no vive solo en el catálogo y las páginas: Illustrator/InDesign
  // lo cuelgan de cada Form XObject (con streams AIPrivateData de decenas de
  // KB) y pdfTeX añade PTEX.* a cada figura incluida. Se recorren todos los
  // objetos; lo que quede sin referenciar lo elimina garbage=deduplicate.
  const sweep = sweepObjects(doc, remove.pieceInfo, remove.metadata !== "keep");
  if (sweep.metadataRemoved > 0) notes.push(`${sweep.metadataRemoved} bloques XMP de imágenes y objetos eliminados`);
  if (remove.pieceInfo && (sweep.privateRemoved > 0 || has(root, "PieceInfo"))) {
    safeDelete(root, "PieceInfo");
    notes.push(
      sweep.privateRemoved > 1
        ? `Datos privados de aplicación eliminados (${sweep.privateRemoved} objetos)`
        : "Datos privados de aplicación eliminados",
    );
  }

  // ── Interactividad que el usuario decidió no conservar ───────────
  if (!preserve.bookmarks && has(root, "Outlines")) {
    safeDelete(root, "Outlines");
    if (asName(get(root, "PageMode")) === "UseOutlines") safeDelete(root, "PageMode");
    notes.push("Marcadores eliminados");
  }
  if (!preserve.layers && has(root, "OCProperties")) {
    safeDelete(root, "OCProperties");
    notes.push("Capas eliminadas (todo el contenido queda visible)");
  }
  if (!preserve.attachments) {
    const names = resolveDict(get(root, "Names"));
    if (has(names, "EmbeddedFiles")) {
      safeDelete(names, "EmbeddedFiles");
      notes.push("Adjuntos eliminados");
    }
  }
  if (!preserve.forms && has(root, "AcroForm")) {
    safeDelete(root, "AcroForm");
    notes.push("Formularios eliminados");
  } else if (remove.xfa) {
    // Formulario híbrido: el AcroForm ya describe todos los campos; los paquetes
    // XFA solo los repiten para LiveCycle/Acrobat. Un XFA dinámico (NeedsRendering)
    // no tiene AcroForm real detrás y se conserva siempre.
    const acro = resolveDict(get(root, "AcroForm"));
    const fields = resolveArray(get(acro, "Fields"));
    const dynamic = asBool(get(root, "NeedsRendering")) || asBool(get(acro, "NeedsRendering"));
    if (acro && has(acro, "XFA") && fields && fields.length > 0 && !dynamic) {
      const bytes = xfaBytes(get(acro, "XFA"));
      safeDelete(acro, "XFA");
      notes.push(`Datos XFA duplicados eliminados (${formatBytes(bytes)}); el formulario sigue funcionando`);
    }
  }
  if (remove.structureTree) {
    safeDelete(root, "StructTreeRoot");
    safeDelete(root, "MarkInfo");
    notes.push("Estructura de accesibilidad eliminada");
  }

  // ── Por página ───────────────────────────────────────────────────
  const dropAnnotSubtypes = new Set<string>();
  const dropAll = !preserve.annotations;
  if (!preserve.links) dropAnnotSubtypes.add("Link");
  if (!preserve.forms) dropAnnotSubtypes.add("Widget");
  if (!preserve.attachments) dropAnnotSubtypes.add("FileAttachment");
  const keepWhenDroppingAll = new Set<string>();
  if (dropAll) {
    if (preserve.links) keepWhenDroppingAll.add("Link");
    if (preserve.forms) keepWhenDroppingAll.add("Widget");
  }

  let thumbs = 0;
  let annotsRemoved = 0;
  for (let i = 0; i < pageCount; i++) {
    let page: PDFObject;
    try {
      page = doc.findPage(i);
    } catch {
      continue;
    }
    if (remove.thumbnails && has(page, "Thumb")) {
      safeDelete(page, "Thumb");
      thumbs++;
    }
    if (remove.pieceInfo) safeDelete(page, "PieceInfo");
    if (remove.javascript) safeDelete(page, "AA");

    const annots = resolveArray(get(page, "Annots"));
    if (annots && (dropAll || dropAnnotSubtypes.size > 0 || remove.javascript)) {
      const kept: PDFObject[] = [];
      let changed = false;
      forEachEntry(annots, (aRef) => {
        const a = resolveDict(aRef);
        const sub = asName(get(a, "Subtype")) ?? "";
        const drop = dropAll ? !keepWhenDroppingAll.has(sub) : dropAnnotSubtypes.has(sub);
        if (drop) {
          changed = true;
          annotsRemoved++;
          return;
        }
        if (remove.javascript && a && !preserve.forms) {
          const action = resolveDict(get(a, "A"));
          if (action && asName(get(action, "S")) === "JavaScript") safeDelete(a, "A");
          safeDelete(a, "AA");
        }
        kept.push(aRef);
      });
      if (changed) {
        if (kept.length === 0) safeDelete(page, "Annots");
        else {
          const arr = doc.newArray();
          for (const k of kept) arr.push(k);
          page.put("Annots", arr);
        }
      }
    }
  }
  if (thumbs) notes.push(`${thumbs} miniaturas eliminadas`);
  if (annotsRemoved) notes.push(`${annotsRemoved} anotaciones eliminadas`);
  return { notes, attachmentsBytes: preserve.attachments ? attachmentsBytes(doc, root, pageCount) : 0 };
}

/** Bytes de los streams XFA (un stream o un array [nombre, stream, …]). */
function xfaBytes(xfa: PDFObject | null): number {
  if (!xfa) return 0;
  const arr = resolveArray(xfa);
  if (!arr) return streamLength(xfa);
  let total = 0;
  forEachEntry(arr, (v) => {
    total += streamLength(v);
  });
  return total;
}

/**
 * Peso de los adjuntos reales: árbol de nombres /EmbeddedFiles y anotaciones
 * FileAttachment (sus /EF apuntan a los streams). No se cuenta cualquier
 * stream /Type /EmbeddedFile suelto: los paquetes XFA también usan ese tipo.
 */
function attachmentsBytes(doc: PDFDocument, root: PDFObject, pageCount: number): number {
  const seen = new Set<number>();
  let total = 0;
  const addFilespec = (fs: PDFObject | null) => {
    const ef = resolveDict(get(resolveDict(fs), "EF"));
    forEachEntry(ef, (stream) => {
      const n = objectNumber(stream);
      if (n != null) {
        if (seen.has(n)) return;
        seen.add(n);
      }
      total += streamLength(stream);
    });
  };
  const walkTree = (node: PDFObject | null, depth: number) => {
    if (!node || depth > 32) return;
    forEachEntry(resolveArray(get(node, "Names")), (v, k) => {
      if (typeof k === "number" && k % 2 === 1) addFilespec(v);
    });
    forEachEntry(resolveArray(get(node, "Kids")), (kid) => walkTree(resolveDict(kid), depth + 1));
  };
  walkTree(resolveDict(get(root, "Names", "EmbeddedFiles")), 0);
  for (let i = 0; i < pageCount; i++) {
    let page: PDFObject;
    try {
      page = doc.findPage(i);
    } catch {
      continue;
    }
    forEachEntry(resolveArray(get(page, "Annots")), (aRef) => {
      const a = resolveDict(aRef);
      if (asName(get(a, "Subtype")) === "FileAttachment") addFilespec(get(a, "FS"));
    });
  }
  return total;
}

/** Claves de datos privados que no aportan nada al documento final. */
const PRIVATE_KEYS = ["PieceInfo", "PTEX.FileName", "PTEX.InfoDict", "PTEX.PageNumber"];

interface SweepResult {
  privateRemoved: number;
  metadataRemoved: number;
}

/**
 * Una pasada por todos los objetos del documento: borra claves privadas de
 * cualquier diccionario (incluidos los de streams, siempre a través de la
 * referencia indirecta, nunca resolviéndolos) y, si se pide, los bloques XMP
 * que Photoshop/InDesign cuelgan de cada imagen (`/Metadata`), que pueden
 * pesar más que el texto del documento. El XMP del catálogo se trata aparte.
 */
function sweepObjects(doc: PDFDocument, removePrivate: boolean, removeMetadata: boolean): SweepResult {
  const result: SweepResult = { privateRemoved: 0, metadataRemoved: 0 };
  if (!removePrivate && !removeMetadata) return result;
  let count: number;
  try {
    count = doc.countObjects();
  } catch {
    return result;
  }
  for (let i = 1; i < count; i++) {
    let ref: PDFObject;
    try {
      ref = doc.newIndirect(i);
      if (!ref.isStream() && !ref.isDictionary()) continue;
    } catch {
      continue;
    }
    if (removeMetadata && asName(get(ref, "Type")) !== "Catalog" && has(ref, "Metadata")) {
      safeDelete(ref, "Metadata");
      result.metadataRemoved++;
    }
    if (!removePrivate) continue;
    let removed = false;
    for (const key of PRIVATE_KEYS) {
      if (has(ref, key)) {
        safeDelete(ref, key);
        removed = true;
      }
    }
    if (removed) {
      // LastModified acompaña a PieceInfo (la especificación lo exige junto a él).
      safeDelete(ref, "LastModified");
      result.privateRemoved++;
    }
  }
  return result;
}

function safeDelete(obj: PDFObject | null, key: string): void {
  if (!obj) return;
  try {
    if (has(obj, key)) obj.delete(key);
  } catch {
    /* ignore */
  }
}
