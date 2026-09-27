import type { AnchorHTMLAttributes, ReactNode } from "react";
import { ArrowUpRight } from "./icons";

/**
 * Link — componente NUEVO (no existe en Figma). Un link navega; un Button
 * actúa. Hereda el tamaño del texto donde vive.
 *   inline (default): primary/accent + subrayado primary/border → accent-hover
 *   standalone: Medium, sin subrayado hasta hover — para "Ver todas →" fuera del párrafo
 *   neutral: text/default subrayado — en textos donde el verde compite
 *   externo: icono arrow-up-right y rel="noreferrer"
 */
export interface LinkProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  variant?: "inline" | "standalone" | "neutral";
  /** Abre en pestaña nueva, agrega el icono y lo anuncia */
  external?: boolean;
  children: ReactNode;
}

const variants = {
  inline:
    "text-primary-accent underline decoration-primary-border underline-offset-4 hover:text-primary-accent-hover hover:decoration-primary-accent-hover",
  standalone:
    "inline-flex items-center gap-1 font-medium text-primary-accent underline-offset-4 hover:text-primary-accent-hover hover:underline [&_svg]:size-[1em]",
  neutral: "text-fg underline decoration-border-strong underline-offset-4 hover:decoration-fg",
};

export function Link({ variant = "inline", external, className = "", children, ...props }: LinkProps) {
  return (
    <a
      {...props}
      {...(external ? { target: "_blank", rel: "noreferrer" } : {})}
      className={`rounded-xs transition-colors focus-visible:shadow-[0_0_0_2px_var(--focus-ring)] focus-visible:outline-none ${variants[variant]} ${className}`.trim()}
    >
      {children}
      {external && (
        <>
          <ArrowUpRight className={variant === "standalone" ? "" : "ml-0.5 inline size-[0.9em] align-[-0.1em]"} />
          <span className="sr-only"> (se abre en una pestaña nueva)</span>
        </>
      )}
    </a>
  );
}
