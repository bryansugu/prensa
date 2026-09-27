import { zipSync } from "fflate";

export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function downloadUrl(url: string, fileName: string): void {
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/** Empaqueta varios PDF en un ZIP sin recomprimir (los PDF ya están comprimidos). */
export async function zipFiles(entries: Array<{ name: string; url: string }>): Promise<Blob> {
  const files: Record<string, Uint8Array> = {};
  const used = new Set<string>();
  for (const e of entries) {
    const res = await fetch(e.url);
    let name = e.name;
    let n = 2;
    while (used.has(name)) name = e.name.replace(/\.pdf$/i, ` (${n++}).pdf`);
    used.add(name);
    files[name] = new Uint8Array(await res.arrayBuffer());
  }
  const zipped = zipSync(files, { level: 0 });
  return new Blob([zipped], { type: "application/zip" });
}
