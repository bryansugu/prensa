/**
 * Proyecto Pages "prensa-domain": la puerta de entrada de pdf.cdc.cool.
 * Cloudflare Pages admite dominios con DNS externo (CNAME en GoDaddy), un Worker
 * no. Este Function reenvía TODAS las peticiones (SPA, /api, WebSockets) al
 * Worker `prensa` mediante el service binding APP definido en wrangler.jsonc.
 */
export async function onRequest(context) {
  return context.env.APP.fetch(context.request);
}
