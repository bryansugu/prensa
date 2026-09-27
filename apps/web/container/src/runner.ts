/**
 * Servidor HTTP mínimo dentro del contenedor. El Worker (SchedulerDO) le envía
 * trabajos; el runner reporta progreso y resultados llamando de vuelta al Worker.
 */
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { RunJobPayload } from "@prensa/schema";
import { activeJobs, cancelJob, runJob } from "./job";
import { hasTool } from "./stages";

const PORT = Number(process.env.PORT ?? 8080);
const SECRET = process.env.INTERNAL_SECRET ?? "";
const MAX_CONCURRENT = Number(process.env.MAX_CONCURRENT_JOBS ?? 1);

function json(res: ServerResponse, status: number, body: unknown): void {
  const data = JSON.stringify(body);
  res.writeHead(status, { "content-type": "application/json", "content-length": Buffer.byteLength(data) });
  res.end(data);
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const text = Buffer.concat(chunks).toString("utf8");
  return text ? (JSON.parse(text) as unknown) : null;
}

function authorized(req: IncomingMessage): boolean {
  if (!SECRET) return true;
  return req.headers.authorization === `Bearer ${SECRET}`;
}

async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    const url = new URL(req.url ?? "/", "http://engine");
    if (req.method === "GET" && url.pathname === "/health") {
      const tools = await Promise.all(["gs", "ocrmypdf", "qpdf", "mutool", "jbig2", "tesseract"].map(async (t) => [t, await hasTool(t)] as const));
      return json(res, 200, { ok: true, active: activeJobs(), tools: Object.fromEntries(tools) });
    }
    if (!authorized(req)) return json(res, 401, { error: "unauthorized" });
    if (req.method === "POST" && url.pathname === "/run") {
      if (activeJobs() >= MAX_CONCURRENT) return json(res, 409, { error: "busy" });
      const parsed = RunJobPayload.safeParse(await readJson(req));
      if (!parsed.success) return json(res, 400, { error: "invalid_payload", issues: parsed.error.issues.slice(0, 3) });
      void runJob(parsed.data, SECRET);
      return json(res, 202, { accepted: true, jobId: parsed.data.jobId });
    }
    if (req.method === "POST" && url.pathname === "/cancel") {
      const body = (await readJson(req)) as { jobId?: string } | null;
      return json(res, 200, { cancelled: body?.jobId ? cancelJob(body.jobId) : false });
    }
    json(res, 404, { error: "not_found" });
  } catch (err) {
    json(res, 500, { error: err instanceof Error ? err.message : String(err) });
  }
}

const server = createServer((req, res) => {
  void handle(req, res);
});

server.listen(PORT, () => {
  console.log(`[prensa-engine] escuchando en :${PORT}`);
});

for (const sig of ["SIGTERM", "SIGINT"] as const) {
  process.on(sig, () => {
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 5000).unref();
  });
}
