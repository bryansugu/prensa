"use client";

import type { ReactElement, ReactNode } from "react";
import { Drawer as Base } from "@base-ui/react/drawer";
import { Close } from "./icons";

/**
 * Drawer — componente NUEVO. Panel que entra desde un borde: detalle de un
 * ítem, filtros, edición lateral, menú en mobile. Deja ver la página detrás.
 *   lateral 400 (sm 320 · lg 480) · inferior hasta 80 % del alto
 *   bg/elevated + Elevation/xl · borde interior border/default · padding 24
 *   scrim negro a opacity-scrim · se cierra deslizando hacia su borde
 * Foco atrapado, Esc, swipe y devolución del foco: Base UI Drawer.
 */
export type DrawerSide = "right" | "left" | "bottom";

export interface DrawerProps {
  trigger?: ReactElement<Record<string, unknown>>;
  side?: DrawerSide;
  size?: "sm" | "md" | "lg";
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: ReactNode;
}

const widths = { sm: "w-80", md: "w-100", lg: "w-120" };
const swipe: Record<DrawerSide, "right" | "left" | "down"> = { right: "right", left: "left", bottom: "down" };

export function Drawer({ trigger, side = "right", size = "md", open, onOpenChange, children }: DrawerProps) {
  const bottom = side === "bottom";
  const move = bottom ? "[transform:translateY(var(--drawer-swipe-movement-y))]" : "[transform:translateX(var(--drawer-swipe-movement-x))]";
  const off = bottom
    ? "data-ending-style:[transform:translateY(100%)] data-starting-style:[transform:translateY(100%)]"
    : side === "right"
      ? "data-ending-style:[transform:translateX(100%)] data-starting-style:[transform:translateX(100%)]"
      : "data-ending-style:[transform:translateX(-100%)] data-starting-style:[transform:translateX(-100%)]";
  const place = bottom ? "items-end justify-center" : side === "right" ? "items-stretch justify-end" : "items-stretch justify-start";
  const shape = bottom
    ? "max-h-[80dvh] w-full rounded-t-2xl border-t pb-[env(safe-area-inset-bottom,0px)]"
    : `h-full max-w-[calc(100vw-3rem)] ${widths[size]} ${side === "right" ? "border-l" : "border-r"}`;

  return (
    <Base.Root open={open} onOpenChange={onOpenChange} swipeDirection={swipe[side]}>
      {trigger && <Base.Trigger render={trigger} />}
      <Base.Portal>
        <Base.Backdrop className="fixed inset-0 z-50 min-h-dvh bg-black opacity-[calc(0.6*(1-var(--drawer-swipe-progress)))] transition-opacity duration-(--ds-duration-slow) ease-exit data-ending-style:opacity-0 data-starting-style:opacity-0 data-swiping:duration-0 motion-reduce:transition-none" />
        <Base.Viewport className={`fixed inset-0 z-50 flex ${place}`}>
          <Base.Popup
            className={`flex flex-col overflow-hidden border-border bg-bg-elevated text-fg shadow-xl outline-none transition-transform duration-(--ds-duration-slow) ease-[cubic-bezier(0.32,0.72,0,1)] data-swiping:select-none motion-reduce:transition-none ${move} ${off} ${shape}`}
          >
            {bottom && <span aria-hidden className="mx-auto mt-3 h-1 w-10 shrink-0 rounded-full bg-border-strong" />}
            <Base.Content className="flex min-h-0 flex-1 flex-col">{children}</Base.Content>
          </Base.Popup>
        </Base.Viewport>
      </Base.Portal>
    </Base.Root>
  );
}

export function DrawerHeader({ title, description, closable = true }: { title: ReactNode; description?: ReactNode; closable?: boolean }) {
  return (
    <div className="flex shrink-0 items-start justify-between gap-4 px-6 pt-6 pb-4">
      <div className="flex min-w-0 flex-col gap-1">
        <Base.Title className="text-lg font-semibold text-fg">{title}</Base.Title>
        {description && <Base.Description className="text-sm text-fg-muted">{description}</Base.Description>}
      </div>
      {closable && (
        <Base.Close
          aria-label="Cerrar"
          className="-m-1 flex size-7 shrink-0 items-center justify-center rounded-full text-icon-subtle transition-colors hover:bg-surface hover:text-icon focus-visible:shadow-[0_0_0_2px_var(--focus-ring)] focus-visible:outline-none [&_svg]:size-4"
        >
          <Close />
        </Base.Close>
      )}
    </div>
  );
}

export function DrawerBody({ className = "", children }: { className?: string; children: ReactNode }) {
  return <div className={`min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-2 text-sm text-fg-muted ${className}`.trim()}>{children}</div>;
}

export function DrawerFooter({ children }: { children: ReactNode }) {
  return <div className="flex shrink-0 justify-end gap-3 border-t border-border px-6 py-4">{children}</div>;
}

export function DrawerClose({ children }: { children: ReactElement<Record<string, unknown>> }) {
  return <Base.Close render={children} />;
}
