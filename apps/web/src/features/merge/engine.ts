/**
 * Worker propio para "Unir": todos los documentos de origen deben vivir en el
 * mismo worker (las páginas se copian entre documentos abiertos), así que no
 * se usa el pool del compresor. Las operaciones van en serie.
 */
import { createEngine, type EngineClient, type EngineHandle } from "@prensa/engine/client";

let handle: EngineHandle | null = null;
let queue: Promise<unknown> = Promise.resolve();

export function mergeApi(): EngineClient {
  handle ??= createEngine();
  return handle.api;
}

export function runSerial<T>(fn: (api: EngineClient) => Promise<T>): Promise<T> {
  const task = queue.then(
    () => fn(mergeApi()),
    () => fn(mergeApi()),
  );
  queue = task.catch(() => undefined);
  return task;
}

/** Mata el worker (cancelación dura / empezar de nuevo). Se recrea perezosamente. */
export function resetMergeEngine(): void {
  handle?.terminate();
  handle = null;
  queue = Promise.resolve();
}
