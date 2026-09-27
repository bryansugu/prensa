import type { EngineContainer } from "./container";
import type { JobDO } from "./do/job";
import type { QuotaDO } from "./do/quota";
import type { SchedulerDO } from "./do/scheduler";

export interface Bindings {
  ASSETS: Fetcher;
  FILES: R2Bucket;
  JOBS: DurableObjectNamespace<JobDO>;
  SCHEDULER: DurableObjectNamespace<SchedulerDO>;
  QUOTA: DurableObjectNamespace<QuotaDO>;
  ENGINE: DurableObjectNamespace<EngineContainer>;
  APP_NAME: string;
  APP_VERSION: string;
  /** URL pública del Worker; el contenedor la usa para reportar progreso y mover archivos */
  WORKER_URL: string;
  MAX_RUNNING: string;
  JOB_TTL_HOURS: string;
  CLOUD_MAX_BYTES: string;
  QUOTA_JOBS_PER_DAY: string;
  QUOTA_BYTES_PER_DAY: string;
  /** Secreto compartido Worker ↔ contenedor */
  INTERNAL_SECRET: string;
  /** Opcional: código para restringir la nube a tu equipo */
  CLOUD_ACCESS_CODE?: string;
  /** Solo desarrollo: URL de un runner local (tsx container/src/runner.ts) en vez del Container */
  ENGINE_DEV_URL?: string;
}

export const PART_SIZE = 32 * 1024 * 1024;

export function num(v: string | undefined, fallback: number): number {
  const n = v ? Number(v) : NaN;
  return Number.isFinite(n) ? n : fallback;
}

export function nowIso(): string {
  return new Date().toISOString();
}
