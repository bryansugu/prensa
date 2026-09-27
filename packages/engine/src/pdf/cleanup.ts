/**
 * Limpieza estructural según las opciones "conservar / eliminar / aplanar".
 * Todo lo que no está explícitamente marcado para eliminar se conserva.
 */
import type { CompressionSpec, DocFeatures } from "@prensa/schema";
import type { PDFDocument, PDFObject } from "../mupdf";
import { asName, forEachEntry, get, has, resolveArray, resolveDict } from "./objects";

const BASIC_INFO_KEYS = new Set(["Title", "Author", "Subject", "Keywords", "CreationDate"]);

export function applyCleanup(doc: PDFDocument, spec: CompressionSpec, features: DocFeatures): string[] {
  const notes: string[] = [];
  const trailer = doc.getTrailer();
  const root = resolveDict(get(trailer, "Root"));
  if (!root) return notes;
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
  if (remove.pieceInfo && has(root, "PieceInfo")) {
    safeDelete(root, "PieceInfo");
    notes.push("Datos privados de aplicación eliminados");
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
  return notes;
}

function safeDelete(obj: PDFObject | null, key: string): void {
  if (!obj) return;
  try {
    if (has(obj, key)) obj.delete(key);
  } catch {
    /* ignore */
  }
}
