import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from "react";

/**
 * Button — portado 1:1 del component set FDS "Button" (640 variantes).
 *
 * Box model de Figma: el alto no es fijo — es padding del cuerpo + contenido.
 *   size  pad  label(h/px)  icono  glifo  float
 *   sm32   4     24/8        24     16     32
 *   md40   6     28/10       28     20     40
 *   lg48   8     32/12       32     24     48
 *   xl64  12     40/16       40     24     64
 *
 * Estados, por rol semántico (= bindings del set en Figma): Fill bg
 * primary/solid → solid-hover → solid-active, label on-solid; Stroke bg
 * bg/elevated → faint → subtle, borde 1.5 y label en primary/accent; Tonal
 * subtle → subtle-hover → subtle-active, borde primary/border, label
 * primary/text; Text label accent → accent-hover → accent-active.
 * Focus ring = focus/ring spread 2 en cuerpo Y floats; Text focus = label 10 +
 * underline 2px. Disabled = opacity 0.38.
 *
 * Modos de icono (dropdown "Icon" en Figma):
 *   inside  — glifo directo, color del label.
 *   pill    — círculo de fondo (siempre redondo, aun con radius semi). En Fill
 *             el círculo es primary-fg y el glifo trackea el bg del botón;
 *             en el resto, círculo Primary/9 + glifo primary-fg.
 *   outside — círculo flotante del alto del botón, fuera del cuerpo, gap 4;
 *             replica el estilo del cuerpo (en semi es cuadrado redondeado).
 *             En Text no hay cuerpo del que salir: usa los círculos del pill.
 */

export type ButtonVariant = "fill" | "stroke" | "tonal" | "text";
export type ButtonSize = "sm" | "md" | "lg" | "xl";
export type ButtonRadius = "full" | "semi";
export type ButtonIconMode = "inside" | "pill" | "outside";

type NativeProps = ButtonHTMLAttributes<HTMLButtonElement> &
  Pick<AnchorHTMLAttributes<HTMLAnchorElement>, "target" | "rel" | "download">;

export interface ButtonProps extends NativeProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  radius?: ButtonRadius;
  /** Cómo se presentan iconLeft/iconRight */
  iconMode?: ButtonIconMode;
  /** Icono a la izquierda del label */
  iconLeft?: ReactNode;
  /** Icono a la derecha del label */
  iconRight?: ReactNode;
  /** Solo icono — requiere aria-label */
  iconOnly?: ReactNode;
  /** Muestra un spinner y bloquea el clic sin cambiar el ancho ni perder el foco */
  loading?: boolean;
  /** Ocupa todo el ancho del contenedor */
  fullWidth?: boolean;
  /** Si se pasa, renderiza un <a> con apariencia de botón */
  href?: string;
  children?: ReactNode;
}

interface SizeSpec {
  bodyPad: string;
  label: string;
  /** contenedor de icono interno (inside/pill/icon-only) */
  icon: string;
  /** tamaño del glifo svg */
  glyph: string;
  /** círculo flotante del modo outside = alto total del botón */
  float: string;
  semi: string;
}

const sizeSpec: Record<ButtonSize, SizeSpec> = {
  sm: { bodyPad: "p-1", label: "h-6 px-2 text-sm", icon: "size-6", glyph: "[&_svg]:size-4", float: "size-8", semi: "rounded-sm" },
  md: { bodyPad: "p-1.5", label: "h-7 px-2.5 text-md", icon: "size-7", glyph: "[&_svg]:size-5", float: "size-10", semi: "rounded-md" },
  lg: { bodyPad: "p-2", label: "h-8 px-3 text-md", icon: "size-8", glyph: "[&_svg]:size-6", float: "size-12", semi: "rounded-lg" },
  xl: { bodyPad: "p-3", label: "h-10 px-4 text-lg", icon: "size-10", glyph: "[&_svg]:size-6", float: "size-16", semi: "rounded-xl" },
};

/** Label sin padding para variant text (el cuerpo no tiene caja) */
const textLabel: Record<ButtonSize, string> = {
  sm: "h-6 text-sm",
  md: "h-7 text-md",
  lg: "h-8 text-md",
  xl: "h-10 text-lg",
};

const focusRing =
  "group-focus-visible/btn:shadow-[0_0_0_2px_var(--focus-ring)]";

/**
 * Clases por estilo, escritas completas para que Tailwind las detecte. Hoy el
 * Button existe solo en el rol primary, igual que el component set de Figma;
 * sumar otro rol es repetir este bloque cambiando `primary` por el rol.
 */
const tone = {
  fill: "bg-primary text-primary-fg group-hover/btn:bg-primary-hover group-active/btn:bg-primary-active",
  stroke: "border-[1.5px] border-primary-accent bg-bg-elevated text-primary-accent group-hover/btn:bg-primary-faint group-active/btn:bg-primary-subtle",
  tonal: "border border-primary-border bg-primary-subtle text-primary-text group-hover/btn:bg-primary-subtle-hover group-active/btn:bg-primary-subtle-active",
  text: "text-primary-accent group-hover/btn:text-primary-accent-hover group-hover/btn:underline group-active/btn:text-primary-accent-active group-focus-visible/btn:text-primary-accent-hover group-focus-visible/btn:underline group-focus-visible/btn:decoration-2",
  pillOnFill: "bg-primary-fg text-primary-accent group-hover/btn:text-primary-accent-hover group-active/btn:text-primary-accent-active",
  pill: "bg-primary text-primary-fg",
};

function Spinner() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="animate-spin motion-reduce:animate-none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" opacity="0.25" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

export function Button({
  variant = "fill",
  size = "md",
  radius = "full",
  iconMode = "inside",
  iconLeft,
  iconRight,
  iconOnly,
  loading = false,
  fullWidth = false,
  href,
  disabled,
  className = "",
  children,
  ...props
}: ButtonProps) {
  const spec = sizeSpec[size];
  const isText = variant === "text";
  const bodyRadius = radius === "full" ? "rounded-full" : spec.semi;
  // Text no tiene cuerpo: sus iconos flotantes son los círculos del pill
  const outside = iconMode === "outside" && !isText && !iconOnly;
  const pill = (iconMode === "pill" || (iconMode === "outside" && isText)) && !iconOnly;
  const surface = isText ? tone.text : `${tone[variant]} ${focusRing}`;
  // loading conserva el ancho: el contenido se oculta y el spinner va centrado encima
  const hideWhenLoading = loading ? "opacity-0" : "";

  const iconBox = `flex shrink-0 items-center justify-center ${spec.icon} ${spec.glyph}`;

  const renderIcon = (icon: ReactNode) =>
    pill ? (
      <span
        className={`${iconBox} rounded-full ${variant === "fill" ? tone.pillOnFill : tone.pill} ${hideWhenLoading} transition-colors`}
      >
        {icon}
      </span>
    ) : (
      <span className={`${iconBox} ${hideWhenLoading}`}>{icon}</span>
    );

  // El flotante replica el cuerpo; en Text no hay cuerpo y usa el círculo del pill
  const renderFloat = (icon: ReactNode) => (
    <span
      className={`flex shrink-0 items-center justify-center ${spec.float} ${spec.glyph} ${bodyRadius} ${surface} transition-colors`}
    >
      {icon}
    </span>
  );

  const spinner = loading && (
    <span className={`absolute inset-0 flex items-center justify-center ${spec.glyph}`}>
      <Spinner />
    </span>
  );

  const body = iconOnly ? (
    <span
      className={`relative flex items-center justify-center transition-colors ${
        isText ? `${iconBox} ${surface}` : `${spec.bodyPad} ${bodyRadius} ${surface}`
      }`}
    >
      {isText ? (
        <span className={hideWhenLoading}>{iconOnly}</span>
      ) : (
        <span className={`${iconBox} ${hideWhenLoading}`}>{iconOnly}</span>
      )}
      {spinner}
    </span>
  ) : (
    <span
      className={`relative flex items-center transition-colors ${fullWidth ? "flex-1 justify-center" : ""} ${
        isText ? `gap-1 ${surface}` : `${spec.bodyPad} ${bodyRadius} ${surface}`
      }`}
    >
      {!outside && iconLeft && renderIcon(iconLeft)}
      <span
        className={`flex items-center justify-center whitespace-nowrap underline-offset-4 ${hideWhenLoading} ${
          isText ? textLabel[size] : spec.label
        }`}
      >
        {children}
      </span>
      {!outside && iconRight && renderIcon(iconRight)}
      {spinner}
    </span>
  );

  const inert = disabled || loading;
  const rootClass = `group/btn items-center gap-1 font-medium focus-visible:outline-none ${
    fullWidth ? "flex w-full" : "inline-flex"
  } ${disabled ? "pointer-events-none opacity-[0.38]" : ""} ${loading ? "pointer-events-none" : ""} ${className}`
    .replace(/\s+/g, " ")
    .trim();

  const content = (
    <>
      {outside && iconLeft && renderFloat(iconLeft)}
      {body}
      {outside && iconRight && renderFloat(iconRight)}
    </>
  );

  if (href !== undefined) {
    // Un link no tiene `disabled`: sin href deja de ser navegable y se anuncia como deshabilitado
    return (
      <a
        href={inert ? undefined : href}
        aria-disabled={inert || undefined}
        aria-busy={loading || undefined}
        className={rootClass}
        {...(props as AnchorHTMLAttributes<HTMLAnchorElement>)}
      >
        {content}
      </a>
    );
  }

  return (
    <button
      type="button"
      disabled={disabled}
      // loading no usa `disabled`: el botón conserva el foco y el lector anuncia "ocupado"
      aria-disabled={loading || undefined}
      aria-busy={loading || undefined}
      onClickCapture={loading ? (e) => e.preventDefault() : undefined}
      className={rootClass}
      {...(props as ButtonHTMLAttributes<HTMLButtonElement>)}
    >
      {content}
    </button>
  );
}
