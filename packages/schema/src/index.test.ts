import { describe, expect, it } from "vitest";
import {
  CompressionSpec,
  defaultSpec,
  formatBytes,
  outputFileName,
  resolveImageParams,
} from "./index";

describe("CompressionSpec", () => {
  it("aplica defaults completos", () => {
    const spec = defaultSpec();
    expect(spec.preset).toBe("smart");
    expect(spec.preserve.forms).toBe(true);
    expect(spec.remove.javascript).toBe(true);
    expect(spec.remove.metadata).toBe("basic");
    expect(spec.cloud.enabled).toBe(false);
  });

  it("rechaza DPI fuera de rango", () => {
    expect(() => CompressionSpec.parse({ images: { colorDpi: 10 } })).toThrow();
  });

  it("resuelve overrides sobre el preset", () => {
    const spec = CompressionSpec.parse({ preset: "screen", images: { jpegQuality: 80, chroma: "444" } });
    const p = resolveImageParams(spec);
    expect(p.photoQuality).toBe(80);
    expect(p.graphicQuality).toBe(88);
    expect(p.chroma).toBe("444");
    expect(p.colorDpi).toBe(110);
  });
});

describe("outputFileName", () => {
  it("reemplaza {original} y agrega .pdf", () => {
    expect(outputFileName("{original}-comprimido", "Informe Q1.pdf")).toBe("Informe Q1-comprimido.pdf");
    expect(outputFileName("final", "a.PDF")).toBe("final.pdf");
    expect(outputFileName("   ", "a.pdf")).toBe("a-comprimido.pdf");
  });
});

describe("formatBytes", () => {
  it("formatea con unidades", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(1536)).toBe("1,50 KB");
    expect(formatBytes(48_300_000)).toBe("46,1 MB");
  });
});
