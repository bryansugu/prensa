import type { AnchorHTMLAttributes, HTMLAttributes, ReactNode } from "react";

/**
 * Card — la base común de los 19 tipos de Card de Figma (Feature, Tarea,
 * Equipo, Pago, Media…). En Figma cada caso de uso es una variante; en código
 * es UNA superficie con partes que se componen, y los casos de uso son recetas
 * (ver ejemplos). Así no hay 19 componentes que mantener.
 *   superficie: bg/elevated + border/default · radius-2xl · padding 24 (sm 16)
 *   elevated: sin borde + Elevation/sm · interactiva: hover Elevation/md + border/hover
 *   título Text lg/Semibold text/default · descripción Text sm text/muted
 *   media a sangre arriba (16:9) · footer separado por border/subtle
 */
export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: "outline" | "elevated";
  padding?: "sm" | "md";
  /** Si se pasa, toda la card es un link (un solo target, un solo tab stop) */
  href?: string;
  linkProps?: Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href" | "className">;
}

const pad = { sm: "[--card-pad:1rem]", md: "[--card-pad:1.5rem]" };

export function Card({ variant = "outline", padding = "md", href, linkProps, className = "", children, ...props }: CardProps) {
  const surface = `group/card relative flex flex-col overflow-hidden rounded-2xl bg-bg-elevated text-fg ${pad[padding]} ${
    variant === "outline" ? "border border-border" : "shadow-sm"
  }`;
  const interactive =
    "transition-[box-shadow,border-color] duration-(--ds-duration-fast) hover:border-border-hover hover:shadow-md focus-visible:shadow-[0_0_0_2px_var(--focus-ring)] focus-visible:outline-none";

  if (href !== undefined) {
    return (
      <a {...linkProps} href={href} className={`${surface} ${interactive} ${className}`.trim()}>
        {children}
      </a>
    );
  }
  return (
    <div {...props} className={`${surface} ${className}`.trim()}>
      {children}
    </div>
  );
}

/** Imagen o ilustración a sangre. Va primera. */
export function CardMedia({ ratio = "16/9", children }: { ratio?: "16/9" | "4/3" | "1/1"; children: ReactNode }) {
  const r = { "16/9": "aspect-[16/9]", "4/3": "aspect-[4/3]", "1/1": "aspect-square" }[ratio];
  return <div className={`w-full shrink-0 overflow-hidden bg-surface ${r} [&>*]:size-full [&>*]:object-cover`}>{children}</div>;
}

export function CardBody({ className = "", children }: { className?: string; children: ReactNode }) {
  return <div className={`flex flex-1 flex-col gap-2 p-(--card-pad) ${className}`.trim()}>{children}</div>;
}

/** Icono destacado: cuadrado redondeado primary/subtle */
export function CardIcon({ children }: { children: ReactNode }) {
  return (
    <span className="mb-2 flex size-10 items-center justify-center rounded-lg bg-primary-subtle text-primary-accent [&_svg]:size-5">
      {children}
    </span>
  );
}

export function CardTitle({ as: Tag = "h3", children }: { as?: "h2" | "h3" | "h4"; children: ReactNode }) {
  return <Tag className="text-lg font-semibold text-fg">{children}</Tag>;
}

export function CardDescription({ children }: { children: ReactNode }) {
  return <p className="text-sm text-fg-muted">{children}</p>;
}

export function CardFooter({ children }: { children: ReactNode }) {
  return (
    <div className="flex shrink-0 items-center justify-between gap-3 border-t border-border-subtle px-(--card-pad) py-4">{children}</div>
  );
}
