"use client";

import type { ReactNode } from "react";
import { Progress as Base } from "@base-ui/react/progress";

/**
 * Progress — componente NUEVO. Avance de una tarea con porcentaje conocido
 * (subida, pasos completados, cuota usada). Sin valor = indeterminado.
 *   pista bg/surface · relleno primary/solid (danger/success con `color`)
 *   sm 4 · md 6 · lg 8 · radius-full · label Text sm/Medium · valor text/muted
 * aria-valuenow/-valuetext y el formato del porcentaje: Base UI.
 */
export type ProgressSize = "sm" | "md" | "lg";

export interface ProgressProps {
  /** 0–max. null = indeterminado */
  value: number | null;
  max?: number;
  size?: ProgressSize;
  color?: "primary" | "success" | "warning" | "danger";
  /** Nombre de la tarea, visible */
  label?: ReactNode;
  /** Muestra el porcentaje a la derecha del label */
  showValue?: boolean;
  className?: string;
}

const heights: Record<ProgressSize, string> = { sm: "h-1", md: "h-1.5", lg: "h-2" };
const fills = { primary: "bg-primary", success: "bg-success", warning: "bg-warning", danger: "bg-danger" };

export function Progress({ value, max = 100, size = "md", color = "primary", label, showValue = false, className = "" }: ProgressProps) {
  return (
    <Base.Root value={value} max={max} className={`flex w-full flex-col gap-2 ${className}`.trim()}>
      {(label || showValue) && (
        <div className="flex items-baseline justify-between gap-3 text-sm">
          {label && <Base.Label className="font-medium text-fg">{label}</Base.Label>}
          {showValue && value !== null && <Base.Value className="ml-auto text-fg-muted" />}
        </div>
      )}
      <Base.Track className={`w-full overflow-hidden rounded-full bg-surface ${heights[size]}`}>
        <Base.Indicator
          className={`h-full rounded-full transition-[width] duration-(--ds-duration-base) ease-move motion-reduce:transition-none data-indeterminate:w-2/5 data-indeterminate:animate-[progress-slide_1.4s_ease-in-out_infinite] ${fills[color]}`}
        />
      </Base.Track>
    </Base.Root>
  );
}
