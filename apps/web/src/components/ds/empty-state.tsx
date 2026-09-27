import type { ReactNode } from "react";

/**
 * Empty state — componente NUEVO. Explica por qué no hay nada y qué hacer.
 * Reemplaza al contenido (una lista, una tabla, una búsqueda), no flota.
 *   icono destacado 48 primary/subtle + primary/accent (o una ilustración)
 *   título Text lg/Semibold · descripción Text sm text/muted · ancho máx. 360
 *   una acción principal + una secundaria como mucho
 */
export interface EmptyStateProps {
  title: ReactNode;
  description?: ReactNode;
  /** Icono (se pinta en el círculo) o ilustración */
  icon?: ReactNode;
  illustration?: ReactNode;
  /** Button primario y, opcionalmente, uno secundario */
  actions?: ReactNode;
  size?: "sm" | "md";
  className?: string;
}

export function EmptyState({ title, description, icon, illustration, actions, size = "md", className = "" }: EmptyStateProps) {
  return (
    <div className={`flex w-full flex-col items-center justify-center text-center ${size === "sm" ? "gap-3 px-4 py-8" : "gap-4 px-6 py-12"} ${className}`.trim()}>
      {illustration && <div className="mb-2 [&>*]:max-h-40">{illustration}</div>}
      {icon && !illustration && (
        <span className={`flex items-center justify-center rounded-full bg-primary-subtle text-primary-accent ${size === "sm" ? "size-10 [&_svg]:size-5" : "size-12 [&_svg]:size-6"}`}>
          {icon}
        </span>
      )}
      <div className="flex max-w-90 flex-col gap-1">
        <h3 className={`font-semibold text-fg ${size === "sm" ? "text-md" : "text-lg"}`}>{title}</h3>
        {description && <p className="text-sm text-fg-muted">{description}</p>}
      </div>
      {actions && <div className="mt-1 flex flex-wrap items-center justify-center gap-3">{actions}</div>}
    </div>
  );
}
