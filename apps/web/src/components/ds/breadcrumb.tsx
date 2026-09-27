import type { AnchorHTMLAttributes, ReactNode } from "react";
import { ChevronRight, DotsHorizontal } from "./icons";

/**
 * Breadcrumb — portado de los sets FDS ".Breadcrumb item" y "Breadcrumb".
 *   Size sm 12 · md 14 · lg 16 · separador chevron-right en border/default
 *   Link: text/subtle → text/muted (hover) · Current: text/default Medium, no es link
 *   Ellipsis: colapsa niveles intermedios en rutas largas
 * <nav aria-label> + <ol>, y aria-current="page" en el último: lo que un lector
 * de pantalla necesita para anunciarlo como ruta.
 */
export type BreadcrumbSize = "sm" | "md" | "lg";

const sizes: Record<BreadcrumbSize, string> = {
  sm: "gap-1.5 text-xs [&_svg]:size-3.5",
  md: "gap-2 text-sm [&_svg]:size-4",
  lg: "gap-2 text-md [&_svg]:size-5",
};

export function Breadcrumb({
  size = "md",
  label = "Ruta de navegación",
  className = "",
  children,
}: {
  size?: BreadcrumbSize;
  /** Nombre accesible del <nav> */
  label?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <nav aria-label={label} className={className}>
      <ol className={`flex flex-wrap items-center ${sizes[size]} [&>li]:flex [&>li]:items-center [&>li]:gap-[inherit]`}>
        {children}
      </ol>
    </nav>
  );
}

const Separator = () => (
  <span aria-hidden className="flex text-border">
    <ChevronRight />
  </span>
);

export interface BreadcrumbItemProps extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "className"> {
  /** Página actual: texto sin link y aria-current="page". Va en el último item */
  current?: boolean;
  icon?: ReactNode;
  /** false en el primer item para no dibujar el separador */
  separator?: boolean;
}

export function BreadcrumbItem({ current, icon, separator = true, href, children, ...props }: BreadcrumbItemProps) {
  const inner = (
    <>
      {icon && <span className="flex shrink-0">{icon}</span>}
      {children}
    </>
  );
  return (
    <li>
      {separator && <Separator />}
      {current || href === undefined ? (
        <span aria-current={current ? "page" : undefined} className={`flex items-center gap-1.5 ${current ? "font-medium text-fg" : "text-fg-subtle"}`}>
          {inner}
        </span>
      ) : (
        <a
          {...props}
          href={href}
          className="flex items-center gap-1.5 rounded-xs text-fg-subtle transition-colors hover:text-fg-muted focus-visible:shadow-[0_0_0_2px_var(--focus-ring)] focus-visible:outline-none"
        >
          {inner}
        </a>
      )}
    </li>
  );
}

/** Niveles colapsados. Si se pasa onClick, es un botón (para abrir un menú con los niveles ocultos). */
export function BreadcrumbEllipsis({ onClick, label = "Mostrar niveles ocultos" }: { onClick?: () => void; label?: string }) {
  return (
    <li>
      <Separator />
      {onClick ? (
        <button
          type="button"
          onClick={onClick}
          aria-label={label}
          className="flex rounded-xs text-fg-subtle transition-colors hover:text-fg-muted focus-visible:shadow-[0_0_0_2px_var(--focus-ring)] focus-visible:outline-none"
        >
          <DotsHorizontal />
        </button>
      ) : (
        <span role="img" aria-label="Niveles intermedios" className="flex text-fg-subtle">
          <DotsHorizontal />
        </span>
      )}
    </li>
  );
}
