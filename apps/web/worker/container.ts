/**
 * Contenedor del motor pesado (Ghostscript, ocrmypdf, jbig2enc + el motor TS).
 * Una instancia por trabajo (getContainer(env.ENGINE, jobId)); duerme sola a
 * los 3 minutos sin actividad y Cloudflare solo cobra mientras corre.
 */
import { Container } from "@cloudflare/containers";
import type { DurableObject } from "cloudflare:workers";
import type { Bindings } from "./env";

export class EngineContainer extends Container<Bindings> {
  override defaultPort = 8080;
  override sleepAfter = "3m";
  override enableInternet = true;

  constructor(ctx: DurableObject<Bindings>["ctx"], env: Bindings) {
    super(ctx, env);
    this.envVars = {
      INTERNAL_SECRET: env.INTERNAL_SECRET,
      PORT: "8080",
    };
  }

  override onStop(params: { exitCode: number; reason: string }): void {
    if (params.exitCode !== 0) console.warn(`[engine] contenedor detenido: code=${params.exitCode} reason=${params.reason}`);
  }
}
