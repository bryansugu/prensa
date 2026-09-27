import { Link } from "@tanstack/react-router";
import { BRAND } from "@/lib/brand";
import { ThemeToggle } from "./ThemeToggle";

const TOOLS = [
  { to: "/", label: "Comprimir", ready: true },
  { to: "/", label: "Unir", ready: false },
  { to: "/", label: "Dividir", ready: false },
] as const;

export function Header() {
  return (
    <header className="sticky top-0 z-40 border-b border-border-subtle bg-bg/85 backdrop-blur supports-[backdrop-filter]:bg-bg/70">
      <a
        href="#contenido"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-3 focus:rounded-md focus:bg-bg-elevated focus:px-3 focus:py-2 focus:text-fg focus:outline-2 focus:outline-focus-ring"
      >
        Saltar al contenido
      </a>
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-4 sm:px-6">
        <Link to="/" className="flex items-center gap-2.5 rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring">
          <span
            aria-hidden
            className="grid size-8 place-items-center rounded-lg bg-primary text-primary-fg"
          >
            <svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <path d="M5 7h10M5 10h10M5 13h10M10 3v2M10 15v2" />
            </svg>
          </span>
          <span className="text-lg font-semibold tracking-tight">{BRAND.name}</span>
        </Link>
        <nav aria-label="Herramientas" className="hidden items-center gap-1 md:flex">
          {TOOLS.map((tool) => (
            <Link
              key={tool.label}
              to={tool.to}
              aria-disabled={!tool.ready}
              className={
                tool.ready
                  ? "rounded-md px-3 py-1.5 text-sm font-medium text-fg hover:bg-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring [&.active]:bg-primary-subtle [&.active]:text-fg"
                  : "pointer-events-none rounded-md px-3 py-1.5 text-sm text-fg-disabled"
              }
              activeOptions={{ exact: true }}
            >
              {tool.label}
              {!tool.ready && <span className="ml-1.5 text-xs text-fg-subtle">pronto</span>}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
