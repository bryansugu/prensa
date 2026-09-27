"use client";

import type { ComponentProps, ReactNode } from "react";
import { Radio as Base } from "@base-ui/react/radio";
import { RadioGroup as BaseGroup } from "@base-ui/react/radio-group";
import { ItemContent, controlOffset, itemRow, type ControlSize } from "./item-content";

/**
 * Radio — portado de los sets FDS "Radio" (30 variantes) + "Radio item".
 *   círculo 16/20/24 · sin marcar: bg/elevated + border/default→strong
 *   marcado: borde primary/accent → accent-hover → accent-active + punto central
 *   foco: focus/ring 2px · disabled: bg/subtle + border/subtle
 * Un radio nunca vive solo: siempre dentro de <RadioGroup> (flechas, roving
 * tabindex y un único tab stop los resuelve Base UI).
 */
export interface RadioGroupProps extends Omit<ComponentProps<typeof BaseGroup>, "className" | "render"> {
  /** Título visible del grupo — se asocia con aria-labelledby */
  label?: ReactNode;
  orientation?: "vertical" | "horizontal";
  className?: string;
}

export function RadioGroup({ label, orientation = "vertical", className = "", children, ...props }: RadioGroupProps) {
  return (
    <BaseGroup
      {...props}
      aria-label={typeof label === "string" && !props["aria-labelledby"] ? label : props["aria-label"]}
      className={`flex gap-3 ${orientation === "vertical" ? "flex-col items-start" : "flex-row flex-wrap items-start gap-x-6"} ${className}`.trim()}
    >
      {label && <span className="text-sm font-medium text-fg">{label}</span>}
      {children}
    </BaseGroup>
  );
}

export interface RadioProps extends Omit<ComponentProps<typeof Base.Root>, "className" | "render"> {
  size?: ControlSize;
  label?: ReactNode;
  supporting?: ReactNode;
  className?: string;
}

const circle: Record<ControlSize, string> = {
  sm: "size-4 [--dot:6px]",
  md: "size-5 [--dot:8px]",
  lg: "size-6 [--dot:10px]",
};

export function Radio({ size = "md", label, supporting, className = "", ...props }: RadioProps) {
  const control = (
    <Base.Root
      {...props}
      className={`flex shrink-0 items-center justify-center rounded-full border border-border bg-bg-elevated text-primary-accent transition-colors hover:border-border-strong focus-visible:shadow-[0_0_0_2px_var(--focus-ring)] focus-visible:outline-none data-checked:border-[1.5px] data-checked:border-primary-accent data-checked:hover:border-primary-accent-hover data-checked:hover:text-primary-accent-hover data-checked:active:border-primary-accent-active data-checked:active:text-primary-accent-active data-disabled:cursor-not-allowed data-disabled:border-border-subtle data-disabled:bg-bg-subtle data-disabled:text-fg-disabled data-disabled:data-checked:border-border-subtle ${circle[size]} ${label ? controlOffset[size] : ""} ${label ? "" : className}`}
    >
      <Base.Indicator className="size-(--dot) rounded-full bg-current data-unchecked:hidden" />
    </Base.Root>
  );

  if (!label) return control;

  return (
    <label className={`${itemRow} ${className}`.trim()}>
      {control}
      <ItemContent size={size} label={label} supporting={supporting} />
    </label>
  );
}
