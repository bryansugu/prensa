"use client";

import type { ReactNode } from "react";
import { Avatar as Base } from "@base-ui/react/avatar";

/**
 * Avatar — hoy es el sub-componente privado ".Avatar" de Card en Figma
 * (xs 24 · sm 32 · md 40, iniciales sobre primary/subtle); acá se hace
 * público y se suman lg 48 / xl 64 e imagen.
 *   fondo primary/subtle · iniciales primary/text Medium · radius-full
 *   en grupo: anillo de 2 px en bg/elevated y solape de ¼ del diámetro
 * Si la imagen falla o tarda, se ven las iniciales (Base UI Avatar).
 */
export type AvatarSize = "xs" | "sm" | "md" | "lg" | "xl";

const sizes: Record<AvatarSize, string> = {
  xs: "size-6 text-[10px]",
  sm: "size-8 text-xs",
  md: "size-10 text-sm",
  lg: "size-12 text-md",
  xl: "size-16 text-lg",
};

export interface AvatarProps {
  /** Nombre completo: da el texto alternativo y las iniciales */
  name: string;
  src?: string;
  size?: AvatarSize;
  className?: string;
}

const initialsOf = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .filter((_, i, all) => i === 0 || i === all.length - 1)
    .join("")
    .toUpperCase();

export function Avatar({ name, src, size = "md", className = "" }: AvatarProps) {
  return (
    <Base.Root
      role="img"
      aria-label={name}
      className={`inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary-subtle font-medium text-primary-text select-none ${sizes[size]} ${className}`.trim()}
    >
      {src && <Base.Image src={src} alt="" className="size-full object-cover" />}
      <Base.Fallback aria-hidden>{initialsOf(name)}</Base.Fallback>
    </Base.Root>
  );
}

const overlap: Record<AvatarSize, string> = { xs: "-space-x-1.5", sm: "-space-x-2", md: "-space-x-2.5", lg: "-space-x-3", xl: "-space-x-4" };

export function AvatarGroup({
  size = "sm",
  max = 4,
  label,
  children,
}: {
  size?: AvatarSize;
  /** Cuántos mostrar antes de resumir en "+N" */
  max?: number;
  /** Nombre accesible del grupo: "Docentes del curso" */
  label?: string;
  children: ReactNode[];
}) {
  const shown = children.slice(0, max);
  const rest = children.length - shown.length;
  return (
    <div role="group" aria-label={label} className={`flex items-center ${overlap[size]} [&>*]:ring-2 [&>*]:ring-bg-elevated`}>
      {shown}
      {rest > 0 && (
        <span
          className={`inline-flex shrink-0 items-center justify-center rounded-full bg-surface font-medium text-fg-muted ${sizes[size]}`}
          aria-label={`${rest} más`}
          role="img"
        >
          +{rest}
        </span>
      )}
    </div>
  );
}
