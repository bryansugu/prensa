import type { ReactNode } from "react";
import { Check } from "./icons";

/**
 * Stepper — componente NUEVO. Muestra en qué paso de un proceso lineal está
 * la persona y cuántos faltan. Informa; no navega (salvo pasos completados).
 *   círculo 32 (sm 24) · conector 2 px · label Text sm Medium · descripción Text xs
 *   completado: primary/solid + check on-solid · actual: bg/elevated + borde
 *   primary/accent 2 px + número primary/accent · pendiente: border/default + text/subtle
 */
export interface Step {
  label: ReactNode;
  description?: ReactNode;
  /** Solo para pasos completados: los vuelve clickeables */
  onClick?: () => void;
}

export interface StepperProps {
  steps: Step[];
  /** Índice del paso actual, desde 0. Igual a steps.length = todo completado */
  current: number;
  orientation?: "horizontal" | "vertical";
  size?: "sm" | "md";
  label?: string;
  className?: string;
}

export function Stepper({ steps, current, orientation = "horizontal", size = "md", label = "Progreso", className = "" }: StepperProps) {
  const circle = size === "sm" ? "size-6 text-xs [&_svg]:size-3.5" : "size-8 text-sm [&_svg]:size-4";
  const vertical = orientation === "vertical";

  return (
    <nav aria-label={label} className={className}>
      <ol className={`flex ${vertical ? "flex-col" : "items-start"}`}>
        {steps.map((step, i) => {
          const state = i < current ? "done" : i === current ? "current" : "todo";
          const last = i === steps.length - 1;
          const bubble = {
            done: "border-primary bg-primary text-primary-fg",
            current: "border-[2px] border-primary-accent bg-bg-elevated font-medium text-primary-accent",
            todo: "border-border bg-bg-elevated text-fg-subtle",
          }[state];
          const line = i < current ? "bg-primary" : "bg-border";
          const inner = (
            <>
              <span aria-hidden className={`flex shrink-0 items-center justify-center rounded-full border font-medium ${circle} ${bubble}`}>
                {state === "done" ? <Check /> : i + 1}
              </span>
              <span className={`flex flex-col ${vertical ? "pt-0.5" : "items-center text-center"}`}>
                <span className={`text-sm font-medium ${state === "todo" ? "text-fg-subtle" : "text-fg"}`}>{step.label}</span>
                {step.description && <span className="text-xs text-fg-muted">{step.description}</span>}
              </span>
            </>
          );
          return (
            <li
              key={i}
              aria-current={state === "current" ? "step" : undefined}
              className={`relative flex ${vertical ? "gap-3 pb-6 last:pb-0" : "flex-1 flex-col items-center gap-2"}`}
            >
              {!last && (
                <span
                  aria-hidden
                  className={`absolute ${line} ${
                    vertical
                      ? `${size === "sm" ? "left-3" : "left-4"} top-8 bottom-0 w-0.5 -translate-x-1/2`
                      : `${size === "sm" ? "top-3" : "top-4"} left-[calc(50%+1.25rem)] right-[calc(-50%+1.25rem)] h-0.5 -translate-y-1/2`
                  }`}
                />
              )}
              {state === "done" && step.onClick ? (
                <button
                  type="button"
                  onClick={step.onClick}
                  className={`flex rounded-md focus-visible:shadow-[0_0_0_2px_var(--focus-ring)] focus-visible:outline-none ${vertical ? "gap-3 text-left" : "flex-col items-center gap-2"}`}
                >
                  {inner}
                </button>
              ) : (
                <span className={`flex ${vertical ? "gap-3" : "flex-col items-center gap-2"}`}>{inner}</span>
              )}
              <span className="sr-only">{state === "done" ? "Completado" : state === "current" ? "Paso actual" : "Pendiente"}</span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
