/**
 * Sincroniza el sistema de diseño Polen desde su registry (estilo shadcn).
 *
 * Por qué un script propio y no `npx shadcn add`: el registry publica las
 * `registryDependencies` con el host placeholder `polen.example`, que no
 * resuelve; el CLI de shadcn fallaría al instalar cualquier componente con
 * dependencias (alert, toast, modal…). Acá descargamos todo desde el host real
 * y reescribimos las referencias.
 *
 * Uso: pnpm ds:sync            (todo)
 *      pnpm ds:sync button card (solo algunos items)
 */
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const REGISTRY = process.env.POLEN_REGISTRY ?? "https://polen.cdc.cool/r";
const PLACEHOLDER_HOSTS = ["https://polen.example/r", "http://polen.example/r"];
const WEB_ROOT = path.resolve(import.meta.dirname, "../apps/web");
const TARGET_ROOT = path.join(WEB_ROOT, "src");

interface RegistryFile {
  path: string;
  type: string;
  target: string;
  content?: string;
}
interface RegistryItem {
  name: string;
  type: string;
  title?: string;
  description?: string;
  dependencies?: string[];
  registryDependencies?: string[];
  files: RegistryFile[];
}
interface Registry {
  name: string;
  items: RegistryItem[];
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
  return (await res.json()) as T;
}

function rewrite(content: string): string {
  let out = content;
  for (const host of PLACEHOLDER_HOSTS) out = out.replaceAll(host, REGISTRY);
  // Los componentes se instalan en components/ds; el registry usa @/registry/ds en algunos imports.
  out = out.replaceAll("@/registry/ds/", "@/components/ds/");
  return out;
}

function targetPath(file: RegistryFile): string {
  // shadcn: "components/ds/button.tsx" | "styles/tokens.css" (relativo a src/)
  const rel = file.target.replace(/^\/+/, "");
  return path.join(TARGET_ROOT, rel);
}

async function main() {
  const only = new Set(process.argv.slice(2));
  const registry = await fetchJson<Registry>(`${REGISTRY}/registry.json`);
  const items = registry.items.filter((it) => only.size === 0 || only.has(it.name));
  if (items.length === 0) throw new Error("No hay items que sincronizar");

  const manifest: Record<string, { files: Record<string, string>; dependencies: string[] }> = {};
  const npmDeps = new Set<string>();

  for (const summary of items) {
    const item = await fetchJson<RegistryItem>(`${REGISTRY}/${summary.name}.json`);
    const entry = { files: {} as Record<string, string>, dependencies: item.dependencies ?? [] };
    manifest[item.name] = entry;
    for (const dep of item.dependencies ?? []) npmDeps.add(dep);
    for (const file of item.files) {
      if (typeof file.content !== "string") continue;
      const content = rewrite(file.content);
      const dest = targetPath(file);
      await mkdir(path.dirname(dest), { recursive: true });
      await writeFile(dest, content, "utf8");
      const hash = createHash("sha256").update(content).digest("hex").slice(0, 12);
      entry.files[path.relative(WEB_ROOT, dest)] = hash;
      console.log(`✓ ${item.name.padEnd(14)} → ${path.relative(WEB_ROOT, dest)}`);
    }
  }

  const dsDir = path.join(TARGET_ROOT, "components/ds");
  await mkdir(dsDir, { recursive: true });
  await writeFile(
    path.join(dsDir, "_manifest.json"),
    JSON.stringify({ registry: REGISTRY, syncedAt: new Date().toISOString(), items: manifest }, null, 2) + "\n",
  );

  // Avisar de dependencias npm que Polen requiere y no están declaradas en apps/web.
  const pkg = JSON.parse(await readFile(path.join(WEB_ROOT, "package.json"), "utf8")) as {
    dependencies?: Record<string, string>;
  };
  const missing = [...npmDeps].filter((d) => !(d in (pkg.dependencies ?? {})));
  if (missing.length) {
    console.warn(`\n⚠ Faltan dependencias npm en apps/web: ${missing.join(", ")}`);
    console.warn(`  pnpm --filter @prensa/web add ${missing.join(" ")}`);
  }
  console.log(`\nPolen sincronizado: ${items.length} items desde ${REGISTRY}`);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
