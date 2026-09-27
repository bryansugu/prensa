import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from "react";

/**
 * Badge y Chip — portados de los sets FDS "Badge" (36 variantes) y "Chip".
 * Regla de tres: **Badge informa** (no es clickeable), **Chip navega o marca
 * estado**, **Button actúa**.
 *   alto 20 / 24 / 28 · texto 12 / 12 / 14 Medium · radius full o semi (radius-sm)
 *   Badge: solo rol primary — fill (primary/solid), tonal (subtle + border +
 *   text), stroke (bg/elevated + accent)
 *   Chip link: neutro — bg/elevated + border/default → bg/subtle + border/strong
 *   Chip status: punto {rol}/solid + label {rol}/text sobre {rol}/subtle
 */
export type BadgeSize = "sm" | "md" | "lg";
export type BadgeRadius = "full" | "semi";

const sizes: Record<BadgeSize, string> = {
  sm: "h-5 gap-1 px-2 text-xs [&_svg]:size-3",
  md: "h-6 gap-1 px-2.5 text-xs [&_svg]:size-3",
  lg: "h-7 gap-1.5 px-3 text-sm [&_svg]:size-3.5",
};
const square: Record<BadgeSize, string> = { sm: "size-5 [&_svg]:size-3", md: "size-6 [&_svg]:size-3.5", lg: "size-7 [&_svg]:size-4" };
const radii: Record<BadgeRadius, string> = { full: "rounded-full", semi: "rounded-sm" };

export interface BadgeProps {
  variant?: "fill" | "tonal" | "stroke";
  size?: BadgeSize;
  radius?: BadgeRadius;
  iconLeft?: ReactNode;
  iconRight?: ReactNode;
  /** Solo icono: cuadrado o círculo. Requiere aria-label */
  iconOnly?: ReactNode;
  "aria-label"?: string;
  children?: ReactNode;
  className?: string;
}

const badgeVariants = {
  fill: "border-transparent bg-primary text-primary-fg",
  tonal: "border-primary-border bg-primary-subtle text-primary-text",
  stroke: "border-primary-accent bg-bg-elevated text-primary-accent",
};

export function Badge({ variant = "tonal", size = "md", radius = "full", iconLeft, iconRight, iconOnly, children, className = "", ...props }: BadgeProps) {
  return (
    <span
      {...props}
      role={iconOnly ? "img" : undefined}
      className={`inline-flex shrink-0 items-center justify-center whitespace-nowrap border font-medium ${badgeVariants[variant]} ${radii[radius]} ${iconOnly ? square[size] : sizes[size]} ${className}`.trim()}
    >
      {iconOnly ?? (
        <>
          {iconLeft}
          {children}
          {iconRight}
        </>
      )}
    </span>
  );
}

type ChipStatus = "success" | "warning" | "danger";

const statusTone: Record<ChipStatus, { box: string; dot: string }> = {
  success: { box: "bg-success-subtle text-success-text", dot: "bg-success" },
  warning: { box: "bg-warning-faint text-warning-text", dot: "bg-warning" },
  danger: { box: "bg-danger-subtle text-danger-text", dot: "bg-danger" },
};

interface ChipBase {
  size?: BadgeSize;
  radius?: BadgeRadius;
  iconLeft?: ReactNode;
  iconRight?: ReactNode;
  children?: ReactNode;
  className?: string;
}

export type ChipProps =
  | (ChipBase & { status: ChipStatus; href?: never })
  | (ChipBase & { status?: undefined; href: string } & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "className" | "children">)
  | (ChipBase & { status?: undefined; href?: undefined } & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className" | "children">);

const chipLink =
  "border border-border bg-bg-elevated text-fg transition-colors hover:border-border-strong hover:bg-bg-subtle active:bg-surface focus-visible:shadow-[0_0_0_2px_var(--focus-ring)] focus-visible:outline-none disabled:pointer-events-none disabled:text-fg-disabled";

export function Chip(props: ChipProps) {
  const { size = "md", radius = "full", iconLeft, iconRight, children, className = "", status, ...rest } = props;
  const base = `inline-flex shrink-0 items-center justify-center whitespace-nowrap font-medium ${radii[radius]} ${sizes[size]}`;

  // Status: informa un estado, no es interactivo. El punto evita depender solo del color.
  if (status) {
    const tone = statusTone[status];
    return (
      <span className={`${base} ${tone.box} ${className}`.trim()}>
        <span aria-hidden className={`size-1.5 shrink-0 rounded-full ${tone.dot}`} />
        {children}
      </span>
    );
  }

  const content = (
    <>
      {iconLeft}
      {children}
      {iconRight}
    </>
  );

  if ("href" in rest && rest.href !== undefined) {
    return (
      <a {...(rest as AnchorHTMLAttributes<HTMLAnchorElement>)} className={`${base} ${chipLink} ${className}`.trim()}>
        {content}
      </a>
    );
  }

  return (
    <button type="button" {...(rest as ButtonHTMLAttributes<HTMLButtonElement>)} className={`${base} ${chipLink} ${className}`.trim()}>
      {content}
    </button>
  );
}
