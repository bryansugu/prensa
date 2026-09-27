"use client";

import type { ComponentProps, ReactNode } from "react";
import { Checkbox as Base } from "@base-ui/react/checkbox";
import { ItemContent, controlOffset, itemRow, type ControlSize } from "./item-content";

/**
 * Checkbox — portado del set FDS "Checkbox" (45 variantes) + "Checkbox item".
 * Modelo de estados de Figma: Checked (Unchecked/Checked/Indeterminate) ×
 * State (Default/Hover/Focus/Pressed/Disabled).
 *   caja 16/20/24 · radius-sm · sin marcar: bg/elevated + border/default→strong
 *   marcado/indeterminado: primary/solid → solid-hover → solid-active + on-solid
 *   foco: focus/ring 2px · disabled: bg/subtle + border/subtle
 * El comportamiento (teclado, input oculto para formularios, aria-checked
 * "mixed") lo resuelve Base UI.
 */
export interface CheckboxProps extends Omit<ComponentProps<typeof Base.Root>, "className" | "render"> {
  size?: ControlSize;
  /** Texto del item. Sin label, el control necesita aria-label */
  label?: ReactNode;
  /** Línea de apoyo bajo el label */
  supporting?: ReactNode;
  className?: string;
}

const box: Record<ControlSize, string> = {
  sm: "size-4 [&_svg]:size-3",
  md: "size-5 [&_svg]:size-3.5",
  lg: "size-6 [&_svg]:size-4",
};

export function Checkbox({ size = "md", label, supporting, className = "", ...props }: CheckboxProps) {
  const control = (
    <Base.Root
      {...props}
      className={`flex shrink-0 items-center justify-center rounded-sm border border-border bg-bg-elevated text-primary-fg transition-colors hover:border-border-strong focus-visible:shadow-[0_0_0_2px_var(--focus-ring)] focus-visible:outline-none data-checked:border-transparent data-checked:bg-primary data-checked:hover:bg-primary-hover data-checked:active:bg-primary-active data-indeterminate:border-transparent data-indeterminate:bg-primary data-indeterminate:hover:bg-primary-hover data-indeterminate:active:bg-primary-active data-disabled:cursor-not-allowed data-disabled:border-border-subtle data-disabled:bg-bg-subtle data-disabled:text-fg-disabled data-disabled:data-checked:bg-bg-subtle data-disabled:data-checked:border-border-subtle data-disabled:data-indeterminate:bg-bg-subtle data-disabled:data-indeterminate:border-border-subtle ${box[size]} ${label ? controlOffset[size] : ""} ${label ? "" : className}`}
    >
      <Base.Indicator className="flex data-unchecked:hidden">
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          {props.indeterminate ? <path d="M4 8h8" /> : <path d="m3.5 8.5 3 3 6-7" />}
        </svg>
      </Base.Indicator>
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
