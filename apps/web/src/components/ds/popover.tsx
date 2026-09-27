"use client";

import type { ReactElement, ReactNode } from "react";
import { Popover as Base } from "@base-ui/react/popover";
import { Close } from "./icons";

/**
 * Popover — componente NUEVO. Contenido secundario anclado a un disparador:
 * un formulario corto, ayuda con links, un filtro. A diferencia del Tooltip,
 * se abre con clic, puede tener controles y se cierra explícitamente.
 *   card bg/elevated + border/default + Elevation/lg · radius-lg · padding 16
 *   ancho 288 (md) / 320 (lg) · separación 8 del disparador
 */
export interface PopoverProps {
  trigger: ReactElement<Record<string, unknown>>;
  title?: ReactNode;
  description?: ReactNode;
  side?: "top" | "right" | "bottom" | "left";
  align?: "start" | "center" | "end";
  size?: "md" | "lg";
  /** Muestra la ✕ arriba a la derecha */
  closable?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children?: ReactNode;
}

export function Popover({ trigger, title, description, side = "bottom", align = "center", size = "md", closable = false, open, onOpenChange, children }: PopoverProps) {
  return (
    <Base.Root open={open} onOpenChange={onOpenChange}>
      <Base.Trigger render={trigger} />
      <Base.Portal>
        <Base.Positioner side={side} align={align} sideOffset={8} className="z-50">
          <Base.Popup
            className={`relative flex origin-(--transform-origin) flex-col gap-3 rounded-lg border border-border bg-bg-elevated p-4 text-sm text-fg shadow-lg outline-none transition-[opacity,scale] duration-(--ds-duration-fast) ease-enter data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0 motion-reduce:transition-none ${size === "lg" ? "w-80" : "w-72"}`}
          >
            {(title || description) && (
              <div className={`flex flex-col gap-1 ${closable ? "pr-7" : ""}`}>
                {title && <Base.Title className="text-sm font-medium text-fg">{title}</Base.Title>}
                {description && <Base.Description className="text-sm text-fg-muted">{description}</Base.Description>}
              </div>
            )}
            {children}
            {closable && (
              <Base.Close
                aria-label="Cerrar"
                className="absolute top-3 right-3 flex size-6 items-center justify-center rounded-sm text-icon-subtle transition-colors hover:bg-surface hover:text-icon focus-visible:shadow-[0_0_0_2px_var(--focus-ring)] focus-visible:outline-none [&_svg]:size-4"
              >
                <Close />
              </Base.Close>
            )}
          </Base.Popup>
        </Base.Positioner>
      </Base.Portal>
    </Base.Root>
  );
}

/** Para cerrar desde un botón propio ("Aplicar"). */
export function PopoverClose({ children }: { children: ReactElement<Record<string, unknown>> }) {
  return <Base.Close render={children} />;
}
