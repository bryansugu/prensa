"use client";

import type { ReactElement, ReactNode } from "react";
import { Tooltip as Base } from "@base-ui/react/tooltip";

/**
 * Tooltip — portado del set FDS "Tooltip" (36 variantes: Arrow × Description).
 *   burbuja: bg/inverse + text/inverse (se invierte sola en dark) · radius-md
 *   padding 8 × 12 · título Text xs/Semibold · descripción Text xs/Regular
 *   flecha 12 × 6 · separación 8 px · ancho máx. 280 · Elevation/lg
 * Abre en hover y en foco, cierra con Esc; el posicionamiento (y el volteo
 * cuando no entra) lo resuelve Base UI. Envolvé la app en <TooltipProvider>
 * para que pasar de un tooltip a otro no repita la espera.
 */
export const TooltipProvider = Base.Provider;

export interface TooltipProps {
  /** Texto principal, corto */
  content: ReactNode;
  /** Segunda línea opcional, más larga */
  description?: ReactNode;
  side?: "top" | "right" | "bottom" | "left";
  align?: "start" | "center" | "end";
  arrow?: boolean;
  /** ms antes de abrir en hover */
  delay?: number;
  /** El disparador: UN elemento enfocable (Button, link, icon-button) */
  children: ReactElement<Record<string, unknown>>;
}

export function Tooltip({ content, description, side = "top", align = "center", arrow = true, delay = 400, children }: TooltipProps) {
  return (
    <Base.Root>
      <Base.Trigger render={children} delay={delay} />
      <Base.Portal>
        <Base.Positioner side={side} align={align} sideOffset={arrow ? 8 : 6} className="z-50">
          <Base.Popup className="flex max-w-70 origin-(--transform-origin) flex-col gap-0.5 rounded-md bg-bg-inverse px-3 py-2 text-xs text-fg-inverse shadow-lg transition-[opacity,scale] duration-(--ds-duration-instant) ease-enter data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0 data-instant:transition-none motion-reduce:transition-none">
            {arrow && (
              <Base.Arrow className="relative block h-1.5 w-3 overflow-clip before:absolute before:bottom-0 before:left-1/2 before:size-[calc(6px*sqrt(2))] before:bg-bg-inverse before:content-[''] before:[transform:translate(-50%,50%)_rotate(45deg)] data-[side=bottom]:-top-1.5 data-[side=left]:-right-[9px] data-[side=left]:rotate-90 data-[side=right]:-left-[9px] data-[side=right]:-rotate-90 data-[side=top]:-bottom-1.5 data-[side=top]:rotate-180" />
            )}
            <span className="font-semibold">{content}</span>
            {description && <span className="opacity-80">{description}</span>}
          </Base.Popup>
        </Base.Positioner>
      </Base.Portal>
    </Base.Root>
  );
}
