/** Crea un cliente Comlink al worker del motor (uno por worker). */
import * as Comlink from "comlink";
import type { ProgressEvent } from "@prensa/schema";
import type { EngineApi } from "./engine.worker";

export type EngineClient = Comlink.Remote<EngineApi>;

export interface EngineHandle {
  api: EngineClient;
  worker: Worker;
  /** Se rechaza si el worker muere (error no capturado, p. ej. sin memoria). Nunca se resuelve. */
  crashed: Promise<never>;
  terminate(): void;
}

export function createEngine(): EngineHandle {
  const worker = new Worker(new URL("./engine.worker.ts", import.meta.url), { type: "module", name: "prensa-engine" });
  const api = Comlink.wrap<EngineApi>(worker);
  let rejectCrash: (err: Error) => void = () => undefined;
  const crashed = new Promise<never>((_, reject) => {
    rejectCrash = reject;
  });
  crashed.catch(() => undefined); // la rechazamos a propósito; quien la use la maneja
  worker.addEventListener("error", (e) => rejectCrash(new Error(`WORKER_CRASHED: ${e.message || "el worker del motor se cerró"}`)));
  worker.addEventListener("messageerror", () => rejectCrash(new Error("WORKER_CRASHED: mensaje ilegible del worker")));
  return {
    api,
    worker,
    crashed,
    terminate: () => {
      api[Comlink.releaseProxy]();
      worker.terminate();
    },
  };
}

/** Envuelve un callback de progreso para pasarlo al worker. */
export function progressProxy(cb: (e: ProgressEvent) => void) {
  return Comlink.proxy(cb);
}

export { Comlink };
