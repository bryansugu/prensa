"use client";

import type { ReactNode } from "react";
import { Toast as Base } from "@base-ui/react/toast";
import { feedbackIcon, type FeedbackColor } from "./alert";
import { Close } from "./icons";

/**
 * Toast — portado del set FDS "Toast" (5 colores).
 *   card: bg/elevated + border/default + Elevation/lg · radius-lg · 380 px · padding 16
 *   icono semántico {rol}/accent · título Text sm/Medium · descripción Text sm
 * Feedback transitorio: aparece abajo a la derecha, se apila (máx. 3), se
 * pausa en hover/foco y se descarta deslizando. Todo eso, más el anuncio a
 * lectores de pantalla, lo resuelve Base UI.
 *
 * Uso: <ToastProvider> una vez en el layout, y `const toast = useToast()`.
 */
const iconTone: Record<FeedbackColor, string> = {
  neutral: "text-icon-muted",
  info: "text-info-accent",
  success: "text-success-accent",
  warning: "text-warning-accent",
  danger: "text-danger-accent",
};

export interface ToastOptions {
  title: string;
  description?: string;
  color?: FeedbackColor;
  /** ms hasta cerrarse solo. 0 = queda hasta que lo cierren */
  timeout?: number;
  action?: { label: string; onClick: () => void };
}

export function useToast() {
  const manager = Base.useToastManager();
  return (options: ToastOptions) =>
    manager.add({
      title: options.title,
      description: options.description,
      type: options.color ?? "neutral",
      timeout: options.timeout,
      // Los errores interrumpen al lector de pantalla; el resto espera su turno
      priority: options.color === "danger" ? "high" : "low",
      actionProps: options.action ? { children: options.action.label, onClick: options.action.onClick } : undefined,
    });
}

// Apilado y gestos: receta de transform de Base UI, con tokens de FDS encima
const stack =
  "[--gap:0.75rem] [--peek:0.75rem] [--scale:calc(max(0,1-(var(--toast-index)*0.1)))] [--shrink:calc(1-var(--scale))] [--height:var(--toast-frontmost-height,var(--toast-height))] [--offset-y:calc(var(--toast-offset-y)*-1+calc(var(--toast-index)*var(--gap)*-1)+var(--toast-swipe-movement-y))] absolute right-0 bottom-0 left-auto z-[calc(1000-var(--toast-index))] mr-0 w-full origin-bottom [transform:translateX(var(--toast-swipe-movement-x))_translateY(calc(var(--toast-swipe-movement-y)-(var(--toast-index)*var(--peek))-(var(--shrink)*var(--height))))_scale(var(--scale))] select-none after:absolute after:top-full after:left-0 after:h-[calc(var(--gap)+1px)] after:w-full after:content-[''] data-ending-style:opacity-0 data-expanded:[transform:translateX(var(--toast-swipe-movement-x))_translateY(calc(var(--offset-y)))] data-limited:opacity-0 data-starting-style:[transform:translateY(150%)] [&[data-ending-style]:not([data-limited]):not([data-swipe-direction])]:[transform:translateY(150%)] data-ending-style:data-[swipe-direction=down]:[transform:translateY(calc(var(--toast-swipe-movement-y)+150%))] data-ending-style:data-[swipe-direction=right]:[transform:translateX(calc(var(--toast-swipe-movement-x)+150%))_translateY(var(--offset-y))] h-[var(--height)] data-expanded:h-[var(--toast-height)] [transition:transform_0.5s_cubic-bezier(0.22,1,0.36,1),opacity_0.5s,height_0.15s] motion-reduce:[transition:opacity_0.2s]";

function ToastList() {
  const { toasts } = Base.useToastManager();
  return toasts.map((toast) => {
    const color = (toast.type as FeedbackColor) ?? "neutral";
    const Icon = feedbackIcon[color] ?? feedbackIcon.neutral;
    return (
      <Base.Root
        key={toast.id}
        toast={toast}
        swipeDirection={["down", "right"]}
        className={`${stack} rounded-lg border border-border bg-bg-elevated text-fg shadow-lg`}
      >
        <Base.Content className="flex items-start gap-3 overflow-hidden p-4 transition-opacity duration-(--ds-duration-fast) data-behind:opacity-0 data-expanded:opacity-100">
          <span className={`mt-0.5 flex shrink-0 [&_svg]:size-5 ${iconTone[color] ?? iconTone.neutral}`}>
            <Icon />
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <Base.Title className="text-sm font-medium text-fg" />
            <Base.Description className="text-sm text-fg-muted" />
            <Base.Action className="mt-1.5 self-start text-sm font-medium text-primary-accent underline-offset-4 hover:text-primary-accent-hover hover:underline focus-visible:underline focus-visible:outline-none" />
          </div>
          <Base.Close
            aria-label="Cerrar"
            className="-m-1 flex size-7 shrink-0 items-center justify-center rounded-sm text-icon-subtle transition-colors hover:bg-surface-hover hover:text-icon focus-visible:shadow-[0_0_0_2px_var(--focus-ring)] focus-visible:outline-none [&_svg]:size-4"
          >
            <Close />
          </Base.Close>
        </Base.Content>
      </Base.Root>
    );
  });
}

export function ToastProvider({ children, timeout = 5000, limit = 3 }: { children: ReactNode; timeout?: number; limit?: number }) {
  return (
    <Base.Provider timeout={timeout} limit={limit}>
      {children}
      <Base.Portal>
        <Base.Viewport className="fixed right-4 bottom-4 z-50 w-[calc(100vw-2rem)] sm:right-6 sm:bottom-6 sm:w-95">
          <ToastList />
        </Base.Viewport>
      </Base.Portal>
    </Base.Provider>
  );
}
