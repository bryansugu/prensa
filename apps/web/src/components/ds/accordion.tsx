"use client";

import { createContext, useContext, type ComponentProps, type ReactNode } from "react";
import { Accordion as Base } from "@base-ui/react/accordion";
import { ChevronDown, Minus, Plus } from "./icons";

/**
 * Accordion — portado de ".Accordion item" (72 variantes) y "Accordion".
 *   Style    divider (un contenedor con divisores) · cards (una card por item)
 *   Toggle   chevron (rota 180°) · plus (→ menos) · capsule (círculo primary/solid)
 *            — nunca una ✕: esa es semántica de cerrar o borrar
 *   Leading  nada · icono · número (primary/accent Medium)
 *   Size     sm (py 14 · px 16 · título 14) · md (py 18 · px 20 · título 16)
 *   hover bg/subtle · disabled text/disabled · acento inferior 3 px primary/solid
 * Un solo item abierto por defecto (`multiple` para varios). Enter/Espacio,
 * aria-expanded/-controls y la animación de alto: Base UI.
 */
export type AccordionStyle = "divider" | "cards";
export type AccordionToggle = "chevron" | "plus" | "capsule";
export type AccordionSize = "sm" | "md";

interface Settings {
  variant: AccordionStyle;
  toggle: AccordionToggle;
  size: AccordionSize;
  accent: boolean;
}

const Ctx = createContext<Settings>({ variant: "divider", toggle: "chevron", size: "md", accent: true });

export interface AccordionProps extends Omit<ComponentProps<typeof Base.Root>, "className" | "render">, Partial<Settings> {
  className?: string;
}

export function Accordion({ variant = "divider", toggle = "chevron", size = "md", accent = true, className = "", ...props }: AccordionProps) {
  return (
    <Ctx.Provider value={{ variant, toggle, size, accent }}>
      <Base.Root
        {...props}
        className={`flex w-full flex-col ${
          variant === "divider" ? "divide-y divide-border overflow-hidden rounded-xl border border-border bg-bg-elevated" : "gap-3"
        } ${className}`.trim()}
      />
    </Ctx.Provider>
  );
}

const sizes = {
  sm: { trigger: "gap-3 px-4 py-3.5 text-sm", panel: "px-4 pb-4 text-sm", icon: "[&_svg]:size-4", capsule: "size-6" },
  md: { trigger: "gap-3.5 px-5 py-4.5 text-md", panel: "px-5 pb-5 text-sm", icon: "[&_svg]:size-5", capsule: "size-7" },
};

export interface AccordionItemProps extends Omit<ComponentProps<typeof Base.Item>, "className" | "render" | "title"> {
  title: ReactNode;
  /** Icono antes del título */
  icon?: ReactNode;
  /** Número antes del título: "01" */
  number?: string;
  /** Una acción al final del contenido — un Button variant="text" */
  action?: ReactNode;
  children: ReactNode;
}

export function AccordionItem({ title, icon, number, action, children, ...props }: AccordionItemProps) {
  const { variant, toggle, size, accent } = useContext(Ctx);
  const s = sizes[size];

  return (
    <Base.Item
      {...props}
      className={`group/acc relative ${variant === "cards" ? "overflow-hidden rounded-xl border border-border bg-bg-elevated shadow-xs" : ""}`}
    >
      <Base.Header className="m-0">
        <Base.Trigger
          className={`flex w-full cursor-default items-center text-left font-medium text-fg outline-none transition-colors hover:bg-bg-subtle focus-visible:shadow-[inset_0_0_0_2px_var(--focus-ring)] data-disabled:cursor-not-allowed data-disabled:text-fg-disabled data-disabled:hover:bg-transparent ${s.trigger}`}
        >
          {number && <span className="shrink-0 text-primary-accent group-data-disabled/acc:text-fg-disabled">{number}</span>}
          {icon && <span className={`flex shrink-0 text-icon-muted group-data-disabled/acc:text-fg-disabled ${s.icon}`}>{icon}</span>}
          <span className="min-w-0 flex-1">{title}</span>
          <span
            aria-hidden
            className={`flex shrink-0 items-center justify-center ${s.icon} ${
              toggle === "capsule"
                ? `${s.capsule} rounded-full bg-primary text-primary-fg group-data-disabled/acc:bg-bg-subtle group-data-disabled/acc:text-fg-disabled [&_svg]:size-4`
                : "text-icon-subtle"
            }`}
          >
            {toggle === "chevron" ? (
              <span className="flex transition-transform duration-(--ds-duration-fast) ease-move group-data-open/acc:rotate-180 motion-reduce:transition-none">
                <ChevronDown />
              </span>
            ) : (
              <>
                <span className="flex group-data-open/acc:hidden">
                  <Plus />
                </span>
                <span className="hidden group-data-open/acc:flex">
                  <Minus />
                </span>
              </>
            )}
          </span>
        </Base.Trigger>
      </Base.Header>
      <Base.Panel className="h-(--accordion-panel-height) overflow-hidden transition-[height] duration-(--ds-duration-fast) ease-move data-ending-style:h-0 data-starting-style:h-0 motion-reduce:transition-none">
        <div className={`flex flex-col items-start gap-3 text-fg-muted ${s.panel}`}>
          {children}
          {action}
        </div>
      </Base.Panel>
      {accent && <span aria-hidden className="absolute inset-x-0 bottom-0 hidden h-[3px] bg-primary group-data-open/acc:block" />}
    </Base.Item>
  );
}
