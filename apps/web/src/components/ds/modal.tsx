"use client";

import type { ComponentProps, ReactElement, ReactNode } from "react";
import { Dialog } from "@base-ui/react/dialog";
import { Close } from "./icons";

/**
 * Modal — portado por composición de ".Modal header", ".Modal footer" y "Modal".
 *   Size    sm 400 · md 480 · lg 560 · radius-2xl · Elevation/xl · sin padding
 *           propio: cada parte trae el suyo, así la media puede ir a sangre
 *   Header  plain · icon (left / center) · media a sangre arriba
 *   Footer  right · full · split · stacked, con divisor opcional (footer fijo)
 *   Scrim   negro a opacity-scrim (60%)
 * Foco atrapado, Esc, clic afuera, scroll bloqueado, foco de vuelta al
 * disparador, aria-labelledby/-describedby: Base UI Dialog.
 */
export type ModalSize = "sm" | "md" | "lg";

const widths: Record<ModalSize, string> = { sm: "max-w-100", md: "max-w-120", lg: "max-w-140" };

export interface ModalProps extends Omit<ComponentProps<typeof Dialog.Root>, "children"> {
  /** El elemento que abre el modal (un Button). Opcional si se controla con `open` */
  trigger?: ReactElement<Record<string, unknown>>;
  size?: ModalSize;
  children: ReactNode;
}

export function Modal({ trigger, size = "md", children, ...props }: ModalProps) {
  return (
    <Dialog.Root {...props}>
      {trigger && <Dialog.Trigger render={trigger} />}
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/60 transition-opacity duration-(--ds-duration-fast) data-ending-style:opacity-0 data-starting-style:opacity-0 motion-reduce:transition-none" />
        <Dialog.Popup
          className={`fixed top-1/2 left-1/2 z-50 flex max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl bg-bg-elevated text-fg shadow-xl outline-none transition-[opacity,scale] duration-(--ds-duration-fast) ease-enter data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0 motion-reduce:transition-none ${widths[size]}`}
        >
          {children}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export interface ModalHeaderProps {
  title: ReactNode;
  subtitle?: ReactNode;
  /** Icono destacado (círculo primary/subtle) */
  icon?: ReactNode;
  /** left: icono a la izquierda del texto · center: todo centrado */
  align?: "left" | "center";
  /** Imagen o ilustración a sangre, arriba del título */
  media?: ReactNode;
  /** false oculta la ✕ — solo si hay un Cancelar visible en el footer */
  closable?: boolean;
}

export function ModalHeader({ title, subtitle, icon, align = "left", media, closable = true }: ModalHeaderProps) {
  const center = align === "center" || Boolean(media);
  return (
    <div className="relative shrink-0">
      {media && <div className="aspect-[16/9] w-full overflow-hidden bg-surface [&>*]:size-full [&>*]:object-cover">{media}</div>}
      <div className={`flex gap-4 px-6 pt-6 ${center ? "flex-col items-center text-center" : icon ? "flex-row items-start" : "flex-col"}`}>
        {icon && (
          <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-primary-subtle text-primary-accent [&_svg]:size-6">
            {icon}
          </span>
        )}
        <div className={`flex min-w-0 flex-col gap-1 ${closable && !center ? "pr-8" : ""}`}>
          <Dialog.Title className="text-lg font-semibold text-fg">{title}</Dialog.Title>
          {subtitle && <Dialog.Description className="text-sm text-fg-muted">{subtitle}</Dialog.Description>}
        </div>
      </div>
      {closable && (
        <Dialog.Close
          aria-label="Cerrar"
          className={`absolute top-4 right-4 flex size-7 items-center justify-center rounded-full transition-colors focus-visible:shadow-[0_0_0_2px_var(--focus-ring)] focus-visible:outline-none [&_svg]:size-4 ${
            media ? "bg-bg-elevated text-icon shadow-xs hover:bg-bg-subtle" : "text-icon-subtle hover:bg-surface hover:text-icon"
          }`}
        >
          <Close />
        </Dialog.Close>
      )}
    </div>
  );
}

/** Cuerpo: scrollea si no entra, y el header y el footer quedan fijos. */
export function ModalBody({ className = "", children }: { className?: string; children: ReactNode }) {
  return <div className={`min-h-0 flex-1 overflow-y-auto px-6 py-4 text-sm text-fg-muted ${className}`.trim()}>{children}</div>;
}

export interface ModalFooterProps {
  /** right: acciones a la derecha · full: mitad y mitad · split: extremos · stacked: apiladas */
  layout?: "right" | "full" | "split" | "stacked";
  /** Línea superior — usala cuando el cuerpo scrollea */
  divider?: boolean;
  children: ReactNode;
}

const layouts = {
  right: "flex-row justify-end",
  full: "flex-row [&>*]:flex-1",
  split: "flex-row justify-between",
  stacked: "flex-col-reverse [&>*]:w-full",
};

export function ModalFooter({ layout = "right", divider = false, children }: ModalFooterProps) {
  return (
    <div className={`flex shrink-0 gap-3 px-6 pt-2 pb-6 ${layouts[layout]} ${divider ? "border-t border-border pt-4" : ""}`}>
      {children}
    </div>
  );
}

/** Envuelve un Button para que cierre el modal al hacer clic (Cancelar, Entendido). */
export function ModalClose({ children }: { children: ReactElement<Record<string, unknown>> }) {
  return <Dialog.Close render={children} />;
}
