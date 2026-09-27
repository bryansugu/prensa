import type { ReactNode } from "react";
import { AlertCircle, AlertTriangle, CheckCircle, Close, InfoCircle } from "./icons";

/**
 * Alert y Banner — portados de los sets FDS "Alert" (45 variantes) y "Banner".
 *   Color  neutral · info · success · warning · danger (en Figma "Error")
 *   Style  subtle (tonal) · outline (borde sobre bg/elevated) · solid (saturado)
 *   Size   sm · md · lg → padding 12 / 16 / 20, título 14 / 16 / 18
 * Tokens por estilo: subtle = {rol}/subtle + border + text, icono accent;
 * outline = bg/elevated + {rol}/border; solid = {rol}/solid + on-solid
 * (warning usa on-solid oscuro; neutral solid es casi negro).
 * El icono es semántico y va fijo por color, como en Figma: no es intercambiable.
 */
export type FeedbackColor = "neutral" | "info" | "success" | "warning" | "danger";
export type AlertVariant = "subtle" | "outline" | "solid";
export type AlertSize = "sm" | "md" | "lg";

export const feedbackIcon: Record<FeedbackColor, typeof InfoCircle> = {
  neutral: InfoCircle,
  info: InfoCircle,
  success: CheckCircle,
  warning: AlertTriangle,
  danger: AlertCircle,
};

interface Tone {
  subtle: string;
  outline: string;
  solid: string;
  /** Icono sobre subtle/outline */
  icon: string;
  /** Título sobre subtle/outline */
  title: string;
}

// Clases literales por rol para que Tailwind las detecte
const tones: Record<FeedbackColor, Tone> = {
  neutral: { subtle: "border-border bg-surface text-fg-muted", outline: "border-border-hover bg-bg-elevated text-fg-muted", solid: "border-transparent bg-neutral text-neutral-fg", icon: "text-icon-muted", title: "text-fg" },
  info: { subtle: "border-info-border bg-info-subtle text-info-text", outline: "border-info-border bg-bg-elevated text-info-text", solid: "border-transparent bg-info text-info-fg", icon: "text-info-accent", title: "text-info-text" },
  success: { subtle: "border-success-border bg-success-subtle text-success-text", outline: "border-success-border bg-bg-elevated text-success-text", solid: "border-transparent bg-success text-success-fg", icon: "text-success-accent", title: "text-success-text" },
  warning: { subtle: "border-warning-border bg-warning-subtle text-warning-text", outline: "border-warning-border bg-bg-elevated text-warning-text", solid: "border-transparent bg-warning text-warning-fg", icon: "text-warning-accent", title: "text-warning-text" },
  danger: { subtle: "border-danger-border bg-danger-subtle text-danger-text", outline: "border-danger-border bg-bg-elevated text-danger-text", solid: "border-transparent bg-danger text-danger-fg", icon: "text-danger-accent", title: "text-danger-text" },
};

const sizes: Record<AlertSize, { box: string; title: string; body: string; icon: string }> = {
  sm: { box: "gap-2.5 p-3", title: "text-sm", body: "text-sm", icon: "[&_svg]:size-4 mt-0.5" },
  md: { box: "gap-3 p-4", title: "text-md", body: "text-sm", icon: "[&_svg]:size-5 mt-0.5" },
  lg: { box: "gap-3.5 p-5", title: "text-lg", body: "text-md", icon: "[&_svg]:size-6 mt-0.5" },
};

export interface AlertProps {
  color?: FeedbackColor;
  variant?: AlertVariant;
  size?: AlertSize;
  title?: ReactNode;
  children?: ReactNode;
  /** Una sola acción: un link o un Button variant="text" */
  action?: ReactNode;
  /** false oculta el icono semántico */
  icon?: boolean;
  /** Si se pasa, muestra el botón de cerrar */
  onDismiss?: () => void;
  /**
   * status (default): se anuncia sin interrumpir. alert: interrumpe al lector de
   * pantalla — solo para errores que bloquean.
   */
  role?: "status" | "alert" | "none";
  className?: string;
}

function DismissButton({ onDismiss, solid }: { onDismiss: () => void; solid: boolean }) {
  return (
    <button
      type="button"
      onClick={onDismiss}
      aria-label="Cerrar"
      className={`-m-1 flex size-7 shrink-0 items-center justify-center rounded-sm transition-colors focus-visible:shadow-[0_0_0_2px_var(--focus-ring)] focus-visible:outline-none [&_svg]:size-4 ${
        solid ? "opacity-80 hover:opacity-100" : "text-icon-subtle hover:bg-surface-hover hover:text-icon"
      }`}
    >
      <Close />
    </button>
  );
}

export function Alert({
  color = "neutral",
  variant = "subtle",
  size = "md",
  title,
  children,
  action,
  icon = true,
  onDismiss,
  role = "status",
  className = "",
}: AlertProps) {
  const tone = tones[color];
  const s = sizes[size];
  const solid = variant === "solid";
  const Icon = feedbackIcon[color];

  return (
    <div
      role={role === "none" ? undefined : role}
      className={`flex w-full items-start rounded-lg border ${tone[variant]} ${s.box} ${className}`.trim()}
    >
      {icon && (
        <span className={`flex shrink-0 ${s.icon} ${solid ? "" : tone.icon}`}>
          <Icon />
        </span>
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        {title && <p className={`font-medium ${s.title} ${solid ? "" : tone.title}`}>{title}</p>}
        {children && <div className={`${s.body} ${solid ? "opacity-90" : ""}`}>{children}</div>}
        {action && <div className="mt-1.5">{action}</div>}
      </div>
      {onDismiss && <DismissButton onDismiss={onDismiss} solid={solid} />}
    </div>
  );
}

export interface BannerProps {
  color?: FeedbackColor;
  variant?: "subtle" | "solid";
  title?: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  icon?: boolean;
  onDismiss?: () => void;
  className?: string;
}

/** Banner — barra de ancho completo, una sola fila, para avisos a nivel de página. */
export function Banner({ color = "neutral", variant = "subtle", title, children, action, icon = true, onDismiss, className = "" }: BannerProps) {
  const tone = tones[color];
  const solid = variant === "solid";
  const Icon = feedbackIcon[color];

  return (
    <div
      role="status"
      className={`flex w-full items-center gap-3 border-y px-4 py-2.5 text-sm ${tone[variant]} ${className}`.trim()}
    >
      {icon && (
        <span className={`flex shrink-0 [&_svg]:size-5 ${solid ? "" : tone.icon}`}>
          <Icon />
        </span>
      )}
      <p className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2">
        {title && <span className={`font-medium ${solid ? "" : tone.title}`}>{title}</span>}
        {children && <span className={solid ? "opacity-90" : ""}>{children}</span>}
      </p>
      {action && <div className="shrink-0">{action}</div>}
      {onDismiss && <DismissButton onDismiss={onDismiss} solid={solid} />}
    </div>
  );
}
