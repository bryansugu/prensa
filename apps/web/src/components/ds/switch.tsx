"use client";

import type { ComponentProps, ReactNode } from "react";
import { Switch as Base } from "@base-ui/react/switch";
import { ItemContent, itemRow, type ControlSize } from "./item-content";

/**
 * Switch — componente NUEVO (todavía no existe en Figma; este es el spec a
 * espejar). Prende/apaga una preferencia con efecto inmediato.
 *   pista 28×16 / 36×20 / 44×24 · thumb = alto − 4 · radius-full
 *   apagado: border/strong → (hover) icon/subtle · prendido: primary/solid → hover → active
 *   thumb: primary/on-solid + elevation/xs · foco: focus/ring 2px
 *   disabled: opacity-disabled sobre el control entero
 */
export interface SwitchProps extends Omit<ComponentProps<typeof Base.Root>, "className" | "render"> {
  size?: ControlSize;
  label?: ReactNode;
  supporting?: ReactNode;
  className?: string;
}

const track: Record<ControlSize, string> = {
  sm: "h-4 w-7 [--thumb:12px] [--travel:12px]",
  md: "h-5 w-9 [--thumb:16px] [--travel:16px]",
  lg: "h-6 w-11 [--thumb:20px] [--travel:20px]",
};

export function Switch({ size = "md", label, supporting, className = "", ...props }: SwitchProps) {
  const control = (
    <Base.Root
      {...props}
      className={`relative flex shrink-0 items-center rounded-full bg-border-strong p-0.5 transition-colors duration-(--ds-duration-fast) ease-move hover:bg-icon-subtle focus-visible:shadow-[0_0_0_2px_var(--bg),0_0_0_4px_var(--focus-ring)] focus-visible:outline-none data-checked:bg-primary data-checked:hover:bg-primary-hover data-checked:active:bg-primary-active data-disabled:cursor-not-allowed data-disabled:opacity-(--ds-opacity-disabled) ${track[size]} ${label ? "mt-0.5" : className}`}
    >
      <Base.Thumb className="size-(--thumb) rounded-full bg-primary-fg shadow-xs transition-transform duration-(--ds-duration-fast) ease-move data-checked:translate-x-(--travel) motion-reduce:transition-none" />
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
