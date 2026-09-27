"use client";

import type { ComponentProps, ReactNode } from "react";
import { Field } from "@base-ui/react/field";

/**
 * Input y Textarea — portados de los sets FDS "Input" (Type=Default) y
 * "Textarea". Geist-style con tokens FDS:
 *   alto 32/40/48 · px 12/14/16 · valor 14/14/16 · radius-md · elevation/xs
 *   campo: bg/elevated + border/default → border/hover (hover)
 *   foco: borde + anillo focus/ring · inválido: danger/accent + anillo danger/border-strong
 *   placeholder: text/subtle · valor: text/default · hint: text/subtle · error: danger/text
 *   disabled: bg/subtle + text/disabled
 * En código el error es UNA prop (`error`): unifica el bool "Destructive" del
 * Input y el State=Error del Textarea de Figma. Label, hint y error quedan
 * asociados al control (for/id, aria-describedby, aria-invalid) vía Base UI Field.
 */
export type FieldSize = "sm" | "md" | "lg";

export interface FieldShellProps {
  size?: FieldSize;
  label?: ReactNode;
  /** Texto de ayuda bajo el campo */
  hint?: ReactNode;
  /** Mensaje de error: si existe, el campo se marca inválido y reemplaza al hint */
  error?: ReactNode;
  className?: string;
}

export const fieldShell =
  "flex w-full items-center rounded-md border border-border bg-bg-elevated text-fg shadow-xs transition-[border-color,box-shadow] hover:border-border-hover focus-within:border-focus-ring focus-within:shadow-[0_0_0_2px_var(--focus-ring)] has-data-invalid:border-danger-accent has-data-invalid:focus-within:border-danger-accent has-data-invalid:focus-within:shadow-[0_0_0_2px_var(--danger-border-strong)] has-data-disabled:cursor-not-allowed has-data-disabled:border-border has-data-disabled:bg-bg-subtle has-data-disabled:text-fg-disabled has-data-disabled:shadow-none";

const control =
  "min-w-0 flex-1 bg-transparent outline-none placeholder:text-fg-subtle disabled:cursor-not-allowed disabled:placeholder:text-fg-disabled";

export const fieldSizes: Record<FieldSize, { box: string; text: string; icon: string }> = {
  sm: { box: "h-8 gap-2 px-3", text: "text-sm", icon: "[&_svg]:size-4" },
  md: { box: "h-10 gap-2 px-3.5", text: "text-sm", icon: "[&_svg]:size-5" },
  lg: { box: "h-12 gap-2.5 px-4", text: "text-md", icon: "[&_svg]:size-5" },
};

export function FieldFrame({
  label,
  hint,
  error,
  required,
  disabled,
  className = "",
  children,
}: FieldShellProps & { required?: boolean; disabled?: boolean; children: ReactNode }) {
  return (
    <Field.Root invalid={Boolean(error)} disabled={disabled} className={`flex w-full flex-col gap-1.5 ${className}`.trim()}>
      {label && (
        <Field.Label className="text-sm font-medium text-fg">
          {label}
          {required && (
            <span aria-hidden className="ml-0.5 text-danger-accent">
              *
            </span>
          )}
        </Field.Label>
      )}
      {children}
      {error ? (
        <Field.Error match className="text-sm text-danger-text">
          {error}
        </Field.Error>
      ) : (
        hint && <Field.Description className="text-sm text-fg-subtle">{hint}</Field.Description>
      )}
    </Field.Root>
  );
}

export interface InputProps
  extends FieldShellProps,
    Omit<ComponentProps<"input">, "size" | "className"> {
  /** Icono decorativo antes del valor */
  iconLeft?: ReactNode;
  /** Icono o acción después del valor */
  iconRight?: ReactNode;
}

export function Input({ size = "md", label, hint, error, className, iconLeft, iconRight, required, disabled, ...props }: InputProps) {
  const s = fieldSizes[size];
  return (
    <FieldFrame label={label} hint={hint} error={error} required={required} disabled={disabled} className={className}>
      <div className={`${fieldShell} ${s.box} ${s.icon}`}>
        {iconLeft && <span className="flex shrink-0 text-icon-subtle">{iconLeft}</span>}
        <Field.Control {...props} required={required} className={`${control} ${s.text} h-full`} />
        {iconRight && <span className="flex shrink-0 text-icon-subtle">{iconRight}</span>}
      </div>
    </FieldFrame>
  );
}

export interface TextareaProps
  extends FieldShellProps,
    Omit<ComponentProps<"textarea">, "className"> {}

const minHeight: Record<FieldSize, string> = { sm: "min-h-20", md: "min-h-30", lg: "min-h-40" };
const areaPad: Record<FieldSize, string> = { sm: "px-3 py-2", md: "px-3.5 py-2.5", lg: "px-4 py-3" };

export function Textarea({ size = "md", label, hint, error, className, required, disabled, ...props }: TextareaProps) {
  return (
    <FieldFrame label={label} hint={hint} error={error} required={required} disabled={disabled} className={className}>
      <div className={fieldShell}>
        <Field.Control
          required={required}
          render={<textarea {...props} />}
          className={`${control} ${fieldSizes[size].text} ${minHeight[size]} ${areaPad[size]} resize-y leading-6`}
        />
      </div>
    </FieldFrame>
  );
}
