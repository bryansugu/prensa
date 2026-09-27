import { OCR_LANGUAGES, type CloudConfig } from "@prensa/schema";
import { Hono } from "hono";
import { internal } from "./api/internal";
import { jobs } from "./api/jobs";
import { uploads } from "./api/uploads";
import { PART_SIZE, num, type Bindings } from "./env";

const app = new Hono<{ Bindings: Bindings }>();

app.get("/api/health", (c) =>
  c.json({
    ok: true,
    name: c.env.APP_NAME,
    version: c.env.APP_VERSION,
    cloud: Boolean(c.env.FILES && c.env.INTERNAL_SECRET),
    time: new Date().toISOString(),
  }),
);

app.get("/api/cloud/config", (c) => {
  const config: CloudConfig = {
    enabled: Boolean(c.env.FILES && c.env.INTERNAL_SECRET),
    maxBytes: num(c.env.CLOUD_MAX_BYTES, 2 * 1024 ** 3),
    partSize: PART_SIZE,
    requiresAccessCode: Boolean(c.env.CLOUD_ACCESS_CODE),
    ocrLanguages: [...OCR_LANGUAGES],
    ttlHours: num(c.env.JOB_TTL_HOURS, 24),
  };
  return c.json(config, 200, { "cache-control": "public, max-age=300" });
});

app.route("/api/uploads", uploads);
app.route("/api/jobs", jobs);
app.route("/internal", internal);

// Cualquier /api/* desconocido responde JSON; el resto cae a la SPA (Static Assets).
app.notFound((c) => {
  if (c.req.path.startsWith("/api/") || c.req.path.startsWith("/internal/")) {
    return c.json({ error: "not_found", path: c.req.path }, 404);
  }
  return c.env.ASSETS.fetch(c.req.raw);
});

app.onError((err, c) => {
  console.error("[worker]", err);
  return c.json({ error: "internal_error", message: err.message }, 500);
});

export default app;
export { EngineContainer } from "./container";
export { JobDO } from "./do/job";
export { QuotaDO } from "./do/quota";
export { SchedulerDO } from "./do/scheduler";
