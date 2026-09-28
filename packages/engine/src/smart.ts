/**
 * Preset "Inteligente": parámetros por tipo de documento, decididos tras el
 * análisis. Los presets fijos aplican el mismo DPI/calidad a todo; aquí se
 * ajusta a lo que hay: un escaneo necesita más resolución para leerse, una
 * presentación tolera menos, un documento de texto con pocas fotos puede
 * permitirse más calidad porque casi no pesa.
 */
import { PRESETS, type AnalysisReport, type PresetDefinition } from "@prensa/schema";

export function smartParams(report: AnalysisReport): PresetDefinition {
  const base = { ...PRESETS.smart };
  const imageShare = report.fileSize > 0 ? report.breakdown.images / report.fileSize : 0;
  switch (report.docType) {
    case "scanned":
      // Texto escaneado: 200 dpi mantiene la legibilidad; el gris comprime bien.
      return { ...base, colorDpi: 200, monoDpi: 400, photoQuality: 72, graphicQuality: 80, chroma: "420", minSsim: 0.93 };
    case "presentation":
      // Diapositivas: se ven en pantalla; 130 dpi es más que suficiente.
      return { ...base, colorDpi: 130, photoQuality: 72, graphicQuality: 82, chroma: "420", minSsim: 0.93 };
    case "image":
      return { ...base, colorDpi: 150, photoQuality: 74, graphicQuality: 82, chroma: "420", minSsim: 0.94 };
    case "text":
      // Pocas imágenes: subir calidad casi no cuesta bytes y evita artefactos en logos.
      return imageShare < 0.3
        ? { ...base, colorDpi: 150, photoQuality: 82, graphicQuality: 88, chroma: "444", minSsim: 0.95 }
        : { ...base, colorDpi: 150, photoQuality: 76, graphicQuality: 84, chroma: "420", minSsim: 0.94 };
    case "mixed":
    default:
      return { ...base, colorDpi: 150, photoQuality: 75, graphicQuality: 82, chroma: "420", minSsim: 0.94 };
  }
}
