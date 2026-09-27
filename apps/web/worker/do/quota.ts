/** Cuota diaria por IP para la nube (es pública y gratuita). */
import { DurableObject } from "cloudflare:workers";
import { num, type Bindings } from "../env";

interface DayUsage {
  jobs: number;
  bytes: number;
}

export class QuotaDO extends DurableObject<Bindings> {
  async check(bytes: number): Promise<{ ok: boolean; reason?: string }> {
    const day = new Date().toISOString().slice(0, 10);
    const usage = (await this.ctx.storage.get<DayUsage>(day)) ?? { jobs: 0, bytes: 0 };
    const maxJobs = num(this.env.QUOTA_JOBS_PER_DAY, 20);
    const maxBytes = num(this.env.QUOTA_BYTES_PER_DAY, 5 * 1024 ** 3);
    if (usage.jobs + 1 > maxJobs) return { ok: false, reason: `Límite diario de ${maxJobs} trabajos en la nube alcanzado.` };
    if (usage.bytes + bytes > maxBytes) return { ok: false, reason: "Límite diario de datos en la nube alcanzado." };
    await this.ctx.storage.put(day, { jobs: usage.jobs + 1, bytes: usage.bytes + bytes });
    // Limpieza: borrar días viejos y programar borrado del actual en 48 h
    await this.ctx.storage.setAlarm(Date.now() + 48 * 3600 * 1000);
    return { ok: true };
  }

  override async alarm(): Promise<void> {
    const today = new Date().toISOString().slice(0, 10);
    const all = await this.ctx.storage.list<DayUsage>();
    for (const key of all.keys()) if (key < today) await this.ctx.storage.delete(key);
  }
}
