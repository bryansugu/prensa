import { describe, expect, it } from "vitest";
import { estimateLocalMemoryNeed, isFatalEngineError, isMemoryError, profileFromSignals } from "./memory";

const MiB = 1024 ** 2;

describe("perfil de memoria", () => {
  it("un equipo de 8 GB mantiene los topes de 150/400 MB", () => {
    const p = profileFromSignals({ deviceMemory: 8, mobile: false });
    expect(p.hardLimit).toBe(400 * MiB);
    expect(p.softLimit).toBe(150 * MiB);
    expect(p.source).toBe("deviceMemory");
  });
  it("un equipo de 2 GB baja los límites", () => {
    const p = profileFromSignals({ deviceMemory: 2, mobile: false });
    expect(p.hardLimit).toBeLessThan(200 * MiB);
    expect(p.hardLimit).toBeGreaterThan(150 * MiB);
    expect(p.softLimit).toBeLessThan(80 * MiB);
  });
  it("un móvil sin deviceMemory queda acotado a ~1 GiB de presupuesto", () => {
    const p = profileFromSignals({ mobile: true });
    expect(p.source).toBe("mobile");
    expect(p.budget).toBeLessThanOrEqual(1024 ** 3);
    expect(p.hardLimit).toBeLessThan(400 * MiB);
  });
  it("un escritorio desconocido usa los valores por defecto", () => {
    const p = profileFromSignals({ mobile: false });
    expect(p.source).toBe("default");
    expect(p.hardLimit).toBeGreaterThan(300 * MiB);
  });
  it("la estimación crece con el archivo y con la imagen más grande", () => {
    expect(estimateLocalMemoryNeed(100 * MiB, 0)).toBeGreaterThan(350 * MiB);
    expect(estimateLocalMemoryNeed(10 * MiB, 40_000_000)).toBeGreaterThan(450 * MiB);
  });
  it("clasifica errores de memoria y fatales", () => {
    expect(isMemoryError(new Error("Aborted(Cannot enlarge memory arrays)"))).toBe(true);
    expect(isMemoryError(new RangeError("Array buffer allocation failed"))).toBe(true);
    expect(isMemoryError(new Error("out of memory"))).toBe(true);
    expect(isMemoryError(new Error("Documento no abierto"))).toBe(false);
    expect(isFatalEngineError(new Error("Aborted(Cannot enlarge memory arrays)"))).toBe(true);
    expect(isFatalEngineError(new Error("out of memory"))).toBe(false);
  });
});
