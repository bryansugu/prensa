# Deploy en Cloudflare — guía paso a paso

Arquitectura: el Worker `prensa` sirve la SPA y la API (R2 + Durable Objects + Container del motor pesado).
Un proyecto Pages `prensa-domain` da la entrada `pdf.cdc.cool` con un CNAME en GoDaddy (sin mover la zona).
Todo se despliega solo con cada push a `main` (Workers Builds y Pages Git integration).

## Ya hecho

- Plan Workers Paid activo, R2 habilitado, `wrangler login` en esta máquina.
- Bucket `prensa-files` con reglas de ciclo de vida: objetos expiran a 1 día, multipart incompletos se abortan a 1 día.
- `account_id` en `apps/web/wrangler.jsonc`.

## Paso 1 — Conectar el Worker al repo (Workers Builds)

Dashboard → **Workers & Pages → Create → Workers → Import a repository** → `bryansugu/prensa`:

| Campo | Valor |
|---|---|
| Project name | `prensa` |
| Production branch | `main` |
| Root directory | `apps/web` |
| Build command | `pnpm install --frozen-lockfile && pnpm build` |
| Deploy command | `pnpm exec wrangler deploy` |

Save and Deploy. La primera compilación tarda ~8–10 min (construye la imagen del contenedor con jbig2enc).
Al terminar muestra la URL `https://prensa.<subdominio>.workers.dev`.

## Paso 2 — Secretos del Worker (una vez)

Desde esta máquina (ya autorizada):

```bash
cd apps/web
openssl rand -hex 32 | pnpm exec wrangler secret put INTERNAL_SECRET
# opcional, para restringir la nube a tu equipo:
# pnpm exec wrangler secret put CLOUD_ACCESS_CODE
```

## Paso 3 — Proyecto Pages para el dominio

Dashboard → **Workers & Pages → Create → Pages → Import a repository** → `bryansugu/prensa`:

| Campo | Valor |
|---|---|
| Project name | `prensa-domain` |
| Production branch | `main` |
| Root directory | `apps/domain` |
| Framework preset | None |
| Build command | *(vacío)* |
| Build output directory | `public` |

El service binding `APP → prensa` viene en `apps/domain/wrangler.jsonc`. Save and Deploy.

## Paso 4 — `pdf.cdc.cool`

En el proyecto Pages → **Custom domains → Set up a custom domain → `pdf.cdc.cool`**. Como el DNS no está en
Cloudflare, muestra el registro a crear. En GoDaddy → DNS de `cdc.cool` → edita el registro `pdf`:

| Tipo | Nombre | Valor |
|---|---|---|
| CNAME | `pdf` | `prensa-domain.pages.dev` |

(Hoy apunta al Railway de Crunch; reemplázalo.) En unos minutos Cloudflare emite el certificado y `https://pdf.cdc.cool`
queda activo. Apaga el proyecto de Railway cuando quieras.

## Verificación

```bash
curl -s https://pdf.cdc.cool/api/health        # {"ok":true,"cloud":true,...}
curl -s https://pdf.cdc.cool/api/cloud/config
```
En la app: Ajustes → Nube → activar → comprimir un PDF escaneado con OCR.

## Desarrollo local de la nube

```bash
cp apps/web/.dev.vars.example apps/web/.dev.vars   # INTERNAL_SECRET + ENGINE_DEV_URL
pnpm --filter @prensa/web dev:engine                # runner local en :8080 (usa gs/qpdf de tu Mac)
pnpm dev                                             # miniflare simula R2 y Durable Objects
```
Sin Docker local, la imagen solo se construye en CI (`container-image`) y en Workers Builds.
