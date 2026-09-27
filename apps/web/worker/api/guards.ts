import { timingSafeEqual } from "../crypto";
import type { Bindings } from "../env";

/** Devuelve un código de error si la nube exige código de acceso y no coincide. */
export function requireAccessCode(env: Bindings, provided: string | undefined): string | null {
  const required = env.CLOUD_ACCESS_CODE;
  if (!required) return null;
  if (!provided || !timingSafeEqual(required, provided)) return "access_code_required";
  return null;
}

export function isInternal(env: Bindings, authorization: string | undefined): boolean {
  if (!authorization?.startsWith("Bearer ")) return false;
  return timingSafeEqual(env.INTERNAL_SECRET, authorization.slice(7));
}

export function clientIp(headers: Headers): string {
  return headers.get("cf-connecting-ip") ?? headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
}
