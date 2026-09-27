/** Trabajos en la nube: crear, consultar, WebSocket de progreso, cancelar, descargar, borrar. */
import { CreateJobRequest, outputFileName } from "@prensa/schema";
import { Hono } from "hono";
import { randomId, verifyDownload } from "../crypto";
import { num, type Bindings } from "../env";
import { clientIp, requireAccessCode } from "./guards";

export const jobs = new Hono<{ Bindings: Bindings }>();

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

jobs.post("/", async (c) => {
  const body = CreateJobRequest.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: "invalid_request", issues: body.error.issues.slice(0, 3) }, 400);
  const denied = requireAccessCode(c.env, body.data.accessCode);
  if (denied) return c.json({ error: denied }, 403);
  const { uploadKey, fileName, inputSize, spec } = body.data;
  if (!uploadKey.startsWith("uploads/")) return c.json({ error: "invalid_key" }, 400);
  const head = await c.env.FILES.head(uploadKey);
  if (!head) return c.json({ error: "upload_not_found" }, 404);
  if (head.size > num(c.env.CLOUD_MAX_BYTES, 2 * 1024 ** 3)) return c.json({ error: "too_large" }, 413);

  const ip = clientIp(c.req.raw.headers);
  const quota = c.env.QUOTA.get(c.env.QUOTA.idFromName(ip));
  const allowed = await quota.check(head.size);
  if (!allowed.ok) return c.json({ error: "quota_exceeded", message: allowed.reason }, 429);

  const id = randomId();
  const outputKey = `results/${id}/${outputFileName(spec.output.namePattern, fileName)}`;
  const job = c.env.JOBS.get(c.env.JOBS.idFromName(id));
  const callbackUrl = c.env.WORKER_URL || new URL(c.req.url).origin;
  const state = await job.init({ id, fileName, inputSize: head.size || inputSize, inputKey: uploadKey, outputKey, spec, ip, callbackUrl });
  const scheduler = c.env.SCHEDULER.get(c.env.SCHEDULER.idFromName("global"));
  const position = await scheduler.enqueue(id);
  return c.json({ ...state, position }, 201);
});

jobs.get("/:id", async (c) => {
  const id = c.req.param("id");
  if (!UUID.test(id)) return c.json({ error: "invalid_id" }, 400);
  const state = await c.env.JOBS.get(c.env.JOBS.idFromName(id)).get();
  if (!state) return c.json({ error: "not_found" }, 404);
  return c.json(state);
});

jobs.get("/:id/ws", async (c) => {
  const id = c.req.param("id");
  if (!UUID.test(id)) return c.json({ error: "invalid_id" }, 400);
  if (c.req.header("Upgrade") !== "websocket") return c.json({ error: "expected_websocket" }, 426);
  return c.env.JOBS.get(c.env.JOBS.idFromName(id)).fetch(c.req.raw);
});

jobs.post("/:id/cancel", async (c) => {
  const id = c.req.param("id");
  if (!UUID.test(id)) return c.json({ error: "invalid_id" }, 400);
  const job = c.env.JOBS.get(c.env.JOBS.idFromName(id));
  const state = await job.get();
  if (!state) return c.json({ error: "not_found" }, 404);
  const scheduler = c.env.SCHEDULER.get(c.env.SCHEDULER.idFromName("global"));
  const how = await scheduler.cancel(id);
  if (how === "dequeued" || state.status === "queued") await job.failed("CANCELLED");
  return c.json({ ok: true, how });
});

jobs.delete("/:id", async (c) => {
  const id = c.req.param("id");
  if (!UUID.test(id)) return c.json({ error: "invalid_id" }, 400);
  const job = c.env.JOBS.get(c.env.JOBS.idFromName(id));
  const state = await job.get();
  if (!state) return c.json({ error: "not_found" }, 404);
  if (state.status === "running" || state.status === "queued") {
    const scheduler = c.env.SCHEDULER.get(c.env.SCHEDULER.idFromName("global"));
    await scheduler.cancel(id);
    await job.failed("CANCELLED");
  }
  await job.expire();
  return c.json({ ok: true });
});

jobs.get("/:id/download", async (c) => {
  const id = c.req.param("id");
  if (!UUID.test(id)) return c.text("invalid id", 400);
  if (!(await verifyDownload(c.env.INTERNAL_SECRET, id, c.req.query("t")))) return c.text("enlace inválido o vencido", 403);
  const job = c.env.JOBS.get(c.env.JOBS.idFromName(id));
  const [state, meta] = await Promise.all([job.get(), job.meta()]);
  if (!state || !meta || state.status !== "done") return c.text("no disponible", 404);
  const obj = await c.env.FILES.get(meta.outputKey);
  if (!obj) return c.text("archivo eliminado", 410);
  const name = state.outputName ?? "comprimido.pdf";
  const ascii = name.replace(/[^\x20-\x7e]/g, "_").replace(/"/g, "");
  return new Response(obj.body, {
    headers: {
      "content-type": "application/pdf",
      "content-length": String(obj.size),
      "content-disposition": `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`,
      "cache-control": "private, no-store",
      etag: obj.httpEtag,
    },
  });
});
