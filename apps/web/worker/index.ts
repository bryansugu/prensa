import { Hono } from "hono";

type Bindings = {
  ASSETS: Fetcher;
  APP_NAME: string;
  APP_VERSION: string;
};

const app = new Hono<{ Bindings: Bindings }>();

app.get("/api/health", (c) =>
  c.json({
    ok: true,
    name: c.env.APP_NAME,
    version: c.env.APP_VERSION,
    time: new Date().toISOString(),
  }),
);

// Cualquier /api/* desconocido responde JSON; el resto cae a la SPA (Static Assets).
app.notFound((c) => {
  if (c.req.path.startsWith("/api/")) {
    return c.json({ error: "not_found", path: c.req.path }, 404);
  }
  return c.env.ASSETS.fetch(c.req.raw);
});

export default app;
