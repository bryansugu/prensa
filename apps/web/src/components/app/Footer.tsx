import { BRAND } from "@/lib/brand";
import { CdcMark } from "./CdcLogo";

export function Footer() {
  return (
    <footer className="border-t border-border-subtle">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-6 text-sm text-fg-muted sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p className="flex items-center gap-2">
          <CdcMark aria-hidden className="size-5 shrink-0 text-fg" />
          <span>
            Herramienta creada por el{" "}
            <a className="font-medium text-fg underline decoration-border-strong underline-offset-2 hover:decoration-fg" href={BRAND.org.url} target="_blank" rel="noreferrer">
              {BRAND.org.name}
            </a>
            {" · "}
            {BRAND.name} v{BRAND.version}
          </span>
        </p>
        <p className="flex flex-wrap gap-4">
          <span>Tus archivos se procesan en tu dispositivo.</span>
          <a className="hover:text-fg" href={BRAND.repo} target="_blank" rel="noreferrer">
            Código abierto (AGPL-3.0)
          </a>
          <a className="hover:text-fg" href={BRAND.designSystem.url} target="_blank" rel="noreferrer">
            Diseño: {BRAND.designSystem.name}
          </a>
        </p>
      </div>
    </footer>
  );
}
