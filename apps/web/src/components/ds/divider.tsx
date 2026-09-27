import type { ReactNode } from "react";

/**
 * Divider — componente NUEVO. Separa grupos de contenido cuando el espaciado
 * solo no alcanza.
 *   1 px border/default (subtle para divisiones dentro de una superficie)
 *   vertical: ocupa el alto del contenedor flex
 *   con label: texto text/subtle centrado ("o", "Hoy")
 */
export interface DividerProps {
  orientation?: "horizontal" | "vertical";
  variant?: "default" | "subtle";
  /** Texto centrado sobre la línea (solo horizontal) */
  children?: ReactNode;
  className?: string;
}

export function Divider({ orientation = "horizontal", variant = "default", children, className = "" }: DividerProps) {
  const color = variant === "subtle" ? "border-border-subtle" : "border-border";

  if (orientation === "vertical") {
    return <div role="separator" aria-orientation="vertical" className={`self-stretch border-l ${color} ${className}`.trim()} />;
  }
  if (!children) {
    return <hr className={`border-t ${color} ${className}`.trim()} />;
  }
  return (
    <div role="separator" className={`flex items-center gap-3 text-xs text-fg-subtle ${className}`.trim()}>
      <span className={`flex-1 border-t ${color}`} />
      {children}
      <span className={`flex-1 border-t ${color}`} />
    </div>
  );
}
