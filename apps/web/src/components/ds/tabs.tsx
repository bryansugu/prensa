"use client";

import { createContext, useContext, type ComponentProps, type ReactNode } from "react";
import { Tabs as Base } from "@base-ui/react/tabs";

/**
 * Tabs — portado de los sets FDS ".Tab item" (80 variantes) y "Tabs".
 *   Style   underline · solid · segmented · outline (Marker queda solo en Figma:
 *           es un trazo a mano para contextos expresivos)
 *   Size    sm · md → alto 34/40 (underline), 32/40 (solid, outline), 28/36 (segmented)
 *   Radius  full · semi — sin efecto en underline
 * Activo = acento verde: indicador primary/solid (underline), fondo
 * primary/solid (solid), borde y texto primary/accent (outline); segmented es
 * neutro (bg/elevated + Elevation/xs sobre pista bg/surface).
 * El anillo de foco va por dentro (inset): la lista scrollea en horizontal y
 * recortaría un anillo exterior.
 * Flechas, Home/End, roving tabindex y aria-selected/controls: Base UI.
 */
export type TabsVariant = "underline" | "solid" | "segmented" | "outline";
export type TabsSize = "sm" | "md";
export type TabsRadius = "full" | "semi";

const Ctx = createContext<{ variant: TabsVariant; size: TabsSize; radius: TabsRadius }>({
  variant: "underline",
  size: "md",
  radius: "full",
});

export interface TabsProps extends Omit<ComponentProps<typeof Base.Root>, "className" | "render"> {
  variant?: TabsVariant;
  size?: TabsSize;
  radius?: TabsRadius;
  className?: string;
}

export function Tabs({ variant = "underline", size = "md", radius = "full", className = "", ...props }: TabsProps) {
  return (
    <Ctx.Provider value={{ variant, size, radius }}>
      <Base.Root {...props} className={`flex flex-col gap-4 ${className}`.trim()} />
    </Ctx.Provider>
  );
}

const listStyle: Record<TabsVariant, string> = {
  underline: "gap-1 border-b border-border",
  solid: "gap-1",
  segmented: "gap-0.5 self-start bg-surface p-1",
  outline: "gap-2",
};

export function TabList({ className = "", ...props }: Omit<ComponentProps<typeof Base.List>, "render">) {
  const { variant, radius } = useContext(Ctx);
  const track = variant === "segmented" ? (radius === "full" ? "rounded-full" : "rounded-md") : "";
  return (
    <Base.List
      {...props}
      className={`relative flex max-w-full items-center overflow-x-auto ${listStyle[variant]} ${track} ${className}`.trim()}
    />
  );
}

const base =
  "relative flex shrink-0 cursor-default items-center justify-center gap-1.5 whitespace-nowrap font-regular text-fg-muted outline-none transition-colors select-none hover:text-fg focus-visible:shadow-[inset_0_0_0_2px_var(--focus-ring)] data-active:font-medium data-disabled:cursor-not-allowed data-disabled:text-fg-disabled data-disabled:hover:text-fg-disabled";

const tabStyle: Record<TabsVariant, Record<TabsSize, string>> = {
  underline: {
    sm: "-mb-px h-[34px] border-b-2 border-transparent px-2 text-sm data-active:border-primary data-active:text-fg",
    md: "-mb-px h-10 border-b-2 border-transparent px-2 text-sm data-active:border-primary data-active:text-fg",
  },
  solid: {
    sm: "h-8 px-3 text-sm hover:bg-bg-subtle data-active:bg-primary data-active:text-primary-fg data-active:hover:bg-primary data-disabled:hover:bg-transparent",
    md: "h-10 px-4 text-sm hover:bg-bg-subtle data-active:bg-primary data-active:text-primary-fg data-active:hover:bg-primary data-disabled:hover:bg-transparent",
  },
  segmented: {
    sm: "h-7 px-3 text-sm data-active:bg-bg-elevated data-active:text-fg data-active:shadow-xs",
    md: "h-9 px-4 text-sm data-active:bg-bg-elevated data-active:text-fg data-active:shadow-xs",
  },
  outline: {
    sm: "h-8 border border-border bg-bg-elevated px-3 text-sm hover:border-border-strong data-active:border-primary-accent data-active:text-primary-accent data-disabled:bg-bg-subtle data-disabled:hover:border-border",
    md: "h-10 border border-border bg-bg-elevated px-4 text-sm hover:border-border-strong data-active:border-primary-accent data-active:text-primary-accent data-disabled:bg-bg-subtle data-disabled:hover:border-border",
  },
};

const semi: Record<TabsVariant, Record<TabsSize, string>> = {
  underline: { sm: "", md: "" },
  solid: { sm: "rounded-sm", md: "rounded-md" },
  segmented: { sm: "rounded-sm", md: "rounded-sm" },
  outline: { sm: "rounded-sm", md: "rounded-md" },
};

export interface TabProps extends Omit<ComponentProps<typeof Base.Tab>, "className" | "render"> {
  /** Icono antes del label */
  icon?: ReactNode;
  /** Contador o etiqueta después del label — típicamente un <Badge size="sm"> */
  badge?: ReactNode;
  className?: string;
}

export function Tab({ icon, badge, children, className = "", ...props }: TabProps) {
  const { variant, size, radius } = useContext(Ctx);
  const round = variant === "underline" ? "" : radius === "full" ? "rounded-full" : semi[variant][size];
  return (
    <Base.Tab {...props} className={`${base} ${tabStyle[variant][size]} ${round} ${className}`.trim()}>
      {icon && <span className="flex shrink-0 [&_svg]:size-4">{icon}</span>}
      {children}
      {badge && <span className="flex shrink-0 in-data-disabled:opacity-50">{badge}</span>}
    </Base.Tab>
  );
}

export function TabPanel({ className = "", ...props }: Omit<ComponentProps<typeof Base.Panel>, "render">) {
  return (
    <Base.Panel
      {...props}
      className={`outline-none focus-visible:shadow-[0_0_0_2px_var(--focus-ring)] ${className}`.trim()}
    />
  );
}
