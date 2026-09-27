/** Crea un cliente Comlink al worker del motor (uno por worker). */
import * as Comlink from "comlink";
import type { ProgressEvent } from "@prensa/schema";
import type { EngineApi } from "./engine.worker";

export type EngineClient = Comlink.Remote<EngineApi>;

export interface EngineHandle {
  api: EngineClient;
  worker: Worker;
  terminate(): void;
}

export function createEngine(): EngineHandle {
  const worker = new Worker(new URL("./engine.worker.ts", import.meta.url), { type: "module", name: "prensa-engine" });
  const api = Comlink.wrap<EngineApi>(worker);
  return {
    api,
    worker,
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
