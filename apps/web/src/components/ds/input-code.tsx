"use client";

import { Fragment, useId, type ReactNode } from "react";
import { OTPField } from "@base-ui/react/otp-field";

/**
 * Input Code (OTP) — portado del set FDS "Input Code".
 *   celdas 44 / 52 / 60 · radius-md · gap 8 · separador central con 6 dígitos
 *   celda: bg/elevated + border/default · foco: focus/ring (borde + anillo)
 *   dígito: primary/accent, Text xl–2xl Medium · error: danger/accent en todas
 * Pegar el código completo, autocompletado `one-time-code` desde SMS, borrar
 * hacia atrás y moverse con flechas lo resuelve Base UI OTPField.
 */
export type InputCodeSize = "sm" | "md" | "lg";

export interface InputCodeProps {
  /** Cantidad de celdas. 6 agrega separador al medio */
  length?: 4 | 6;
  size?: InputCodeSize;
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  required?: boolean;
  disabled?: boolean;
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  /** Se llama cuando todas las celdas están completas — acá va la verificación */
  onValueComplete?: (value: string) => void;
  name?: string;
  className?: string;
}

const cell: Record<InputCodeSize, string> = {
  sm: "size-11 text-xl",
  md: "size-13 text-xl",
  lg: "size-15 text-2xl",
};

export function InputCode({
  length = 6,
  size = "md",
  label,
  hint,
  error,
  required,
  disabled,
  className = "",
  ...props
}: InputCodeProps) {
  const id = useId();
  const messageId = `${id}-message`;
  const message = error ?? hint;

  return (
    <div className={`flex flex-col items-start gap-1.5 ${className}`.trim()}>
      {label && (
        <label htmlFor={id} className="text-sm font-medium text-fg">
          {label}
          {required && (
            <span aria-hidden className="ml-0.5 text-danger-accent">
              *
            </span>
          )}
        </label>
      )}
      <OTPField.Root
        {...props}
        id={id}
        length={length}
        required={required}
        disabled={disabled}
        aria-invalid={error ? true : undefined}
        aria-describedby={message ? messageId : undefined}
        className="flex items-center gap-2"
      >
        {Array.from({ length }, (_, i) => (
          <Fragment key={i}>
            {length === 6 && i === 3 && <span aria-hidden className="h-0.5 w-3 rounded-full bg-border" />}
            <OTPField.Input
              aria-label={i === 0 ? undefined : `Dígito ${i + 1} de ${length}`}
              className={`rounded-md border bg-bg-elevated text-center font-medium text-primary-accent shadow-xs outline-none transition-[border-color,box-shadow] focus:shadow-[0_0_0_2px_var(--focus-ring)] disabled:cursor-not-allowed disabled:bg-bg-subtle disabled:text-fg-disabled disabled:shadow-none ${cell[size]} ${
                error
                  ? "border-danger-accent focus:shadow-[0_0_0_2px_var(--danger-border-strong)]"
                  : "border-border hover:border-border-hover focus:border-focus-ring"
              }`}
            />
          </Fragment>
        ))}
      </OTPField.Root>
      {message && (
        <p id={messageId} className={`text-sm ${error ? "text-danger-text" : "text-fg-subtle"}`}>
          {message}
        </p>
      )}
    </div>
  );
}
