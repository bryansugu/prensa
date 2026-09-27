/** Tokens de descarga firmados (HMAC-SHA256) y comparación en tiempo constante. */

function b64url(bytes: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function hmac(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64url(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message)));
}

/** token = `${exp}.${firma}`; exp en segundos Unix. */
export async function signDownload(secret: string, jobId: string, expSeconds: number): Promise<string> {
  const sig = await hmac(secret, `download:${jobId}:${expSeconds}`);
  return `${expSeconds}.${sig}`;
}

export async function verifyDownload(secret: string, jobId: string, token: string | undefined): Promise<boolean> {
  if (!token) return false;
  const [expRaw, sig] = token.split(".");
  const exp = Number(expRaw);
  if (!Number.isFinite(exp) || !sig) return false;
  if (exp * 1000 < Date.now()) return false;
  const expected = await hmac(secret, `download:${jobId}:${exp}`);
  return timingSafeEqual(expected, sig);
}

export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function randomId(): string {
  return crypto.randomUUID();
}
