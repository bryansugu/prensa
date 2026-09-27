"use client";

import type { ComponentProps, ReactElement, ReactNode } from "react";
import { Menu as Base } from "@base-ui/react/menu";
import { Check } from "./icons";

/**
 * Dropdown menu — componente NUEVO. Lista de acciones detrás de un botón
 * ("…", "Opciones"). Mismo popover que Select/Menu de Figma:
 *   bg/elevated + border/default + Elevation/lg · radius-md · padding 4
 *   item 36 · radius-sm · resaltado bg/surface · danger/text para destructivas
 *   grupos con label Text xs text/subtle y separadores border/subtle
 * Flechas, typeahead, Esc, foco de vuelta al disparador: Base UI.
 */
export interface MenuProps {
  trigger: ReactElement<Record<string, unknown>>;
  side?: "top" | "right" | "bottom" | "left";
  align?: "start" | "center" | "end";
  children: ReactNode;
}

export function Menu({ trigger, side = "bottom", align = "start", children }: MenuProps) {
  return (
    <Base.Root>
      <Base.Trigger render={trigger} />
      <Base.Portal>
        <Base.Positioner side={side} align={align} sideOffset={4} className="z-50 outline-none">
          <Base.Popup className="min-w-48 origin-(--transform-origin) rounded-md border border-border bg-bg-elevated p-1 shadow-lg outline-none transition-[opacity,scale] duration-(--ds-duration-instant) ease-enter data-ending-style:scale-[0.98] data-ending-style:opacity-0 data-starting-style:scale-[0.98] data-starting-style:opacity-0 motion-reduce:transition-none">
            {children}
          </Base.Popup>
        </Base.Positioner>
      </Base.Portal>
    </Base.Root>
  );
}

const itemClass =
  "flex min-h-9 cursor-default items-center gap-2.5 rounded-sm px-2.5 text-sm outline-none select-none data-disabled:text-fg-disabled [&_svg]:size-4";

export interface MenuItemProps extends Omit<ComponentProps<typeof Base.Item>, "className" | "render"> {
  icon?: ReactNode;
  /** Acción destructiva: rojo, y va última y separada */
  destructive?: boolean;
  /** Atajo de teclado, solo informativo */
  shortcut?: string;
  href?: string;
}

export function MenuItem({ icon, destructive, shortcut, href, children, ...props }: MenuItemProps) {
  const cls = `${itemClass} ${
    destructive
      ? "text-danger-text data-highlighted:bg-danger-faint [&_svg]:text-danger-accent"
      : "text-fg data-highlighted:bg-surface [&_svg]:text-icon-muted"
  }`;
  const content = (
    <>
      {icon}
      <span className="flex-1">{children}</span>
      {shortcut && <kbd className="font-mono text-xs text-fg-subtle">{shortcut}</kbd>}
    </>
  );
  if (href) {
    return (
      <Base.LinkItem href={href} className={cls}>
        {content}
      </Base.LinkItem>
    );
  }
  return (
    <Base.Item {...props} className={cls}>
      {content}
    </Base.Item>
  );
}

export function MenuCheckboxItem({ children, ...props }: Omit<ComponentProps<typeof Base.CheckboxItem>, "className" | "render">) {
  return (
    <Base.CheckboxItem {...props} className={`${itemClass} pl-2 text-fg data-highlighted:bg-surface`}>
      <span className="flex size-4 items-center justify-center text-primary-accent">
        <Base.CheckboxItemIndicator className="flex">
          <Check />
        </Base.CheckboxItemIndicator>
      </span>
      <span className="flex-1">{children}</span>
    </Base.CheckboxItem>
  );
}

export function MenuGroup({ label, children }: { label?: ReactNode; children: ReactNode }) {
  return (
    <Base.Group>
      {label && <Base.GroupLabel className="px-2.5 pt-2 pb-1 text-xs font-medium text-fg-subtle">{label}</Base.GroupLabel>}
      {children}
    </Base.Group>
  );
}

export function MenuSeparator() {
  return <Base.Separator className="my-1 border-t border-border-subtle" />;
}
