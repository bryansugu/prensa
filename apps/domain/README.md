# prensa-domain (Cloudflare Pages)

Puerta de entrada para `pdf.cdc.cool`. No tiene build: solo `functions/[[path]].js`, que reenvía cada petición al
Worker `prensa` a través del service binding `APP` (ver `wrangler.jsonc`).

Configuración en el dashboard (una vez): Workers & Pages → Create → Pages → Import a repository → `bryansugu/prensa`
→ Root directory `apps/domain` → Build command (vacío) → Build output directory `public` → Save and Deploy.
Luego Custom domains → `pdf.cdc.cool` → copiar el CNAME a GoDaddy.
