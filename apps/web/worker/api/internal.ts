/**
 * Endpoints internos para el contenedor (Authorization: Bearer INTERNAL_SECRET):
 * leer/escribir objetos de R2 sin credenciales S3 y reportar progreso.
 */
import { JobDoneReport, JobFailedReport, JobProgressReport } from "@prensa/schema";
import { Hono } from "hono";
import { PART_SIZE, type Bindings } from "../env";
import { isInternal } from "./guards";

export const internal = new Hono<{ Bindings: Bindings }>();

internal.use("*", async (c, next) => {
  if (!isInternal(c.env, c.req.header("authorization"))) return c.json({ error: "unauthorized" }, 401);
  await next();
});

function objectKey(path: string, prefix: string): string | null {
  // /internal/objects/<key...>[/multipart|/parts/n|/complete]
  const rest = path.slice(prefix.length);
  const key = decodeURIComponent(rest);
  if (!key || key.includes("..") || !(key.startsWith("uploads/") || key.startsWith("results/"))) return null;
  return key;
}

// GET /internal/objects/<key>
internal.get("/objects/*", async (c) => {
  const key = objectKey(c.req.path, "/internal/objects/");
  if (!key) return c.json({ error: "invalid_key" }, 400);
  const obj = await c.env.FILES.get(key);
  if (!obj) return c.json({ error: "not_found" }, 404);
  return new Response(obj.body, {
    headers: { "content-type": "application/pdf", "content-length": String(obj.size), etag: obj.httpEtag },
  });
});

// POST /internal/multipart  { key }  → { uploadId }
internal.post("/multipart", async (c) => {
  const body = (await c.req.json().catch(() => null)) as { key?: string } | null;
  const key = body?.key;
  if (!key || !key.startsWith("results/")) return c.json({ error: "invalid_key" }, 400);
  const upload = await c.env.FILES.createMultipartUpload(key);
  return c.json({ uploadId: upload.uploadId, key, partSize: PART_SIZE });
});

// PUT /internal/multipart/:uploadId/parts/:n?key=
internal.put("/multipart/:uploadId/parts/:n", async (c) => {
  const key = c.req.query("key");
  const n = Number(c.req.param("n"));
  if (!key || !key.startsWith("results/") || !Number.isInteger(n) || n < 1) return c.json({ error: "invalid_part" }, 400);
  const body = c.req.raw.body;
  if (!body) return c.json({ error: "empty_body" }, 400);
  const part = await c.env.FILES.resumeMultipartUpload(key, c.req.param("uploadId")).uploadPart(n, body);
  return c.json({ partNumber: part.partNumber, etag: part.etag });
});

// POST /internal/multipart/:uploadId/complete { key, parts }
internal.post("/multipart/:uploadId/complete", async (c) => {
  const body = (await c.req.json().catch(() => null)) as { key?: string; parts?: Array<{ partNumber: number; etag: string }> } | null;
  if (!body?.key || !Array.isArray(body.parts)) return c.json({ error: "invalid_request" }, 400);
  const obj = await c.env.FILES.resumeMultipartUpload(body.key, c.req.param("uploadId")).complete(body.parts);
  return c.json({ key: body.key, size: obj.size });
});

// Progreso / fin / error del trabajo
internal.post("/jobs/:id/progress", async (c) => {
  const body = JobProgressReport.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: "invalid_request" }, 400);
  await c.env.JOBS.get(c.env.JOBS.idFromName(c.req.param("id"))).progress(body.data);
  return c.json({ ok: true });
});

internal.post("/jobs/:id/done", async (c) => {
  const body = JobDoneReport.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: "invalid_request", issues: body.error.issues.slice(0, 3) }, 400);
  const id = c.req.param("id");
  const job = c.env.JOBS.get(c.env.JOBS.idFromName(id));
  const outputName = body.data.outputKey.split("/").pop() ?? "comprimido.pdf";
  await job.done(body.data.result, body.data.outputKey, outputName);
  await c.env.SCHEDULER.get(c.env.SCHEDULER.idFromName("global")).finished(id);
  return c.json({ ok: true });
});

internal.post("/jobs/:id/failed", async (c) => {
  const body = JobFailedReport.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: "invalid_request" }, 400);
  const id = c.req.param("id");
  await c.env.JOBS.get(c.env.JOBS.idFromName(id)).failed(body.data.error);
  await c.env.SCHEDULER.get(c.env.SCHEDULER.idFromName("global")).finished(id);
  return c.json({ ok: true });
});
