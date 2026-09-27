import { BRAND } from "@/lib/brand";

export function Footer() {
  return (
    <footer className="border-t border-border-subtle">
      <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-6 text-sm text-fg-muted sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p>
          {BRAND.name} v{BRAND.version} · Tus archivos se procesan en tu dispositivo.
        </p>
        <p className="flex gap-4">
          <a className="hover:text-fg" href={BRAND.repo} target="_blank" rel="noreferrer">
            Código abierto (AGPL-3.0)
          </a>
          <a className="hover:text-fg" href="https://polen.cdc.cool" target="_blank" rel="noreferrer">
            Diseño: Polen
          </a>
        </p>
      </div>
    </footer>
  );
}
