"use client";

import type { ReactNode } from "react";
import { ArrowLeft, ArrowRight, DotsHorizontal } from "./icons";

/**
 * Pagination — portado de ".Page item" (48 variantes) y los 4 patrones de FDS:
 * numbered · prev-next · compact · arrows.
 *   item 32 / 40 · Square (radius-sm / md) o Circle · gap 4
 *   NEUTRO a propósito: número text/muted → text/default (hover bg/subtle);
 *   página actual = bg/surface + border/default + Medium — no usa el verde de
 *   marca, que queda para los CTAs. Disabled text/disabled.
 *   Anterior/Siguiente: botón neutro (bg/elevated + border/default + Elevation/xs).
 * El componente es controlado: recibe `page` y avisa con `onPageChange`.
 */
export type PaginationSize = "sm" | "md";
export type PaginationShape = "square" | "circle";
export type PaginationVariant = "numbered" | "prev-next" | "compact" | "arrows";

export interface PaginationProps {
  /** Página actual, desde 1 */
  page: number;
  /** Total de páginas */
  count: number;
  onPageChange: (page: number) => void;
  variant?: PaginationVariant;
  size?: PaginationSize;
  shape?: PaginationShape;
  /** Cuántas páginas mostrar a cada lado de la actual (numbered) */
  siblings?: number;
  /** Texto central de prev-next, p. ej. "Mostrando 1 a 10 de 97" */
  summary?: ReactNode;
  /** Nombre accesible del <nav> */
  label?: string;
  className?: string;
}

/** 1 … 4 5 [6] 7 8 … 20 — siempre primera y última, con elipsis donde se saltea */
export function pageRange(page: number, count: number, siblings = 1): (number | "ellipsis")[] {
  const total = siblings * 2 + 5;
  if (count <= total) return Array.from({ length: count }, (_, i) => i + 1);
  const left = Math.max(page - siblings, 1);
  const right = Math.min(page + siblings, count);
  const showLeft = left > 2;
  const showRight = right < count - 1;
  if (!showLeft && showRight) return [...Array.from({ length: siblings * 2 + 3 }, (_, i) => i + 1), "ellipsis", count];
  if (showLeft && !showRight) return [1, "ellipsis", ...Array.from({ length: siblings * 2 + 3 }, (_, i) => count - (siblings * 2 + 2) + i)];
  return [1, "ellipsis", ...Array.from({ length: right - left + 1 }, (_, i) => left + i), "ellipsis", count];
}

const cell: Record<PaginationSize, string> = { sm: "size-8 text-sm [&_svg]:size-4", md: "size-10 text-sm [&_svg]:size-5" };
const round = (shape: PaginationShape, size: PaginationSize) => (shape === "circle" ? "rounded-full" : size === "sm" ? "rounded-sm" : "rounded-md");
const focus = "focus-visible:shadow-[0_0_0_2px_var(--focus-ring)] focus-visible:outline-none";
const item = `flex shrink-0 items-center justify-center border border-transparent text-fg-muted transition-colors hover:bg-bg-subtle hover:text-fg disabled:pointer-events-none disabled:text-fg-disabled ${focus}`;
const neutralButton = `flex shrink-0 items-center justify-center gap-1.5 border border-border bg-bg-elevated font-medium text-fg shadow-xs transition-colors hover:border-border-hover hover:bg-bg-subtle disabled:pointer-events-none disabled:bg-bg-subtle disabled:text-fg-disabled disabled:shadow-none ${focus}`;

export function Pagination({
  page,
  count,
  onPageChange,
  variant = "numbered",
  size = "md",
  shape = "square",
  siblings = 1,
  summary,
  label = "Paginación",
  className = "",
}: PaginationProps) {
  const r = round(shape, size);
  const go = (p: number) => onPageChange(Math.min(Math.max(p, 1), count));
  const first = page <= 1;
  const last = page >= count;

  const arrow = (dir: "prev" | "next", bordered: boolean) => (
    <button
      type="button"
      onClick={() => go(page + (dir === "prev" ? -1 : 1))}
      disabled={dir === "prev" ? first : last}
      aria-label={dir === "prev" ? "Página anterior" : "Página siguiente"}
      className={`${bordered ? neutralButton : item} ${cell[size]} ${r}`}
    >
      {dir === "prev" ? <ArrowLeft /> : <ArrowRight />}
    </button>
  );

  const numbers = (
    <ul className="flex items-center gap-1">
      {pageRange(page, count, siblings).map((p, i) =>
        p === "ellipsis" ? (
          <li key={`e${i}`} aria-hidden className={`flex items-center justify-center text-fg-subtle ${cell[size]}`}>
            <DotsHorizontal />
          </li>
        ) : (
          <li key={p}>
            <button
              type="button"
              onClick={() => go(p)}
              aria-label={`Página ${p}`}
              aria-current={p === page ? "page" : undefined}
              className={`${item} ${cell[size]} ${r} aria-[current=page]:border-border aria-[current=page]:bg-surface aria-[current=page]:font-medium aria-[current=page]:text-fg`}
            >
              {p}
            </button>
          </li>
        ),
      )}
    </ul>
  );

  const pad = size === "sm" ? "h-8 px-3 text-sm [&_svg]:size-4" : "h-10 px-3.5 text-sm [&_svg]:size-5";
  const textButton = (dir: "prev" | "next") => (
    <button
      type="button"
      onClick={() => go(page + (dir === "prev" ? -1 : 1))}
      disabled={dir === "prev" ? first : last}
      className={`${neutralButton} ${pad} ${shape === "circle" ? "rounded-full" : size === "sm" ? "rounded-sm" : "rounded-md"}`}
    >
      {dir === "prev" && <ArrowLeft />}
      {dir === "prev" ? "Anterior" : "Siguiente"}
      {dir === "next" && <ArrowRight />}
    </button>
  );

  return (
    <nav aria-label={label} className={className}>
      {variant === "numbered" && (
        <div className="flex items-center gap-1">
          {arrow("prev", false)}
          {numbers}
          {arrow("next", false)}
        </div>
      )}
      {variant === "prev-next" && (
        <div className="flex w-full items-center justify-between gap-4">
          {textButton("prev")}
          {summary ? <p className="text-sm text-fg-muted">{summary}</p> : <div className="hidden sm:block">{numbers}</div>}
          {textButton("next")}
        </div>
      )}
      {variant === "compact" && (
        <div className="flex items-center gap-2">
          {arrow("prev", true)}
          <p className="min-w-16 text-center text-sm text-fg-muted" aria-live="polite">
            <span className="font-medium text-fg">{page}</span> / {count}
          </p>
          {arrow("next", true)}
        </div>
      )}
      {variant === "arrows" && (
        <div className="flex items-center gap-2">
          {arrow("prev", true)}
          {arrow("next", true)}
        </div>
      )}
    </nav>
  );
}
