/** Subida reanudable a R2 por partes (multipart) a través del Worker: sin credenciales en el cliente. */
import { UploadCompleteRequest, UploadInitRequest } from "@prensa/schema";
import { Hono } from "hono";
import { randomId } from "../crypto";
import { PART_SIZE, num, type Bindings } from "../env";
import { requireAccessCode } from "./guards";

export const uploads = new Hono<{ Bindings: Bindings }>();

function safeName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "documento.pdf";
  const clean = base.replace(/[^\w.\- ()]+/g, "_").slice(0, 150);
  return /\.pdf$/i.test(clean) ? clean : `${clean}.pdf`;
}

uploads.post("/", async (c) => {
  const body = UploadInitRequest.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: "invalid_request" }, 400);
  const denied = requireAccessCode(c.env, body.data.accessCode);
  if (denied) return c.json({ error: denied }, 403);
  const max = num(c.env.CLOUD_MAX_BYTES, 2 * 1024 ** 3);
  if (body.data.size > max) return c.json({ error: "too_large", maxBytes: max }, 413);
  const key = `uploads/${randomId()}/${safeName(body.data.fileName)}`;
  const upload = await c.env.FILES.createMultipartUpload(key, {
    customMetadata: { fileName: body.data.fileName, size: String(body.data.size) },
  });
  return c.json({ uploadId: upload.uploadId, key, partSize: PART_SIZE });
});

uploads.put("/:uploadId/parts/:n", async (c) => {
  const key = c.req.query("key");
  const n = Number(c.req.param("n"));
  if (!key || !key.startsWith("uploads/") || !Number.isInteger(n) || n < 1 || n > 10_000) {
    return c.json({ error: "invalid_part" }, 400);
  }
  const length = Number(c.req.header("content-length"));
  if (!Number.isFinite(length) || length <= 0 || length > PART_SIZE + 1024) return c.json({ error: "invalid_length" }, 400);
  const upload = c.env.FILES.resumeMultipartUpload(key, c.req.param("uploadId"));
  const body = c.req.raw.body;
  if (!body) return c.json({ error: "empty_body" }, 400);
  try {
    const part = await upload.uploadPart(n, body);
    return c.json({ partNumber: part.partNumber, etag: part.etag });
  } catch (err) {
    return c.json({ error: "upload_failed", detail: err instanceof Error ? err.message : String(err) }, 500);
  }
});

uploads.post("/:uploadId/complete", async (c) => {
  const body = UploadCompleteRequest.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: "invalid_request" }, 400);
  const upload = c.env.FILES.resumeMultipartUpload(body.data.key, c.req.param("uploadId"));
  try {
    const obj = await upload.complete(body.data.parts.sort((a, b) => a.partNumber - b.partNumber));
    // Validación mínima: tiene que empezar por %PDF-
    const head = await c.env.FILES.get(body.data.key, { range: { offset: 0, length: 5 } });
    const magic = head ? new TextDecoder().decode(await head.arrayBuffer()) : "";
    if (magic !== "%PDF-") {
      await c.env.FILES.delete(body.data.key);
      return c.json({ error: "not_a_pdf" }, 400);
    }
    return c.json({ key: body.data.key, size: obj.size });
  } catch (err) {
    return c.json({ error: "complete_failed", detail: err instanceof Error ? err.message : String(err) }, 500);
  }
});

uploads.delete("/:uploadId", async (c) => {
  const key = c.req.query("key");
  if (!key || !key.startsWith("uploads/")) return c.json({ error: "invalid_key" }, 400);
  try {
    await c.env.FILES.resumeMultipartUpload(key, c.req.param("uploadId")).abort();
  } catch {
    /* ya abortado o completado */
  }
  return c.json({ ok: true });
});
