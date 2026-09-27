import type { ReactNode } from "react";

export type ControlSize = "sm" | "md" | "lg";

/**
 * Bloque de texto compartido por Checkbox, Radio y Switch — espejo de
 * ".Item content" en Figma: label + texto de apoyo opcional.
 * sm: label 14 · md/lg: label 16. El apoyo siempre 14.
 */
export function ItemContent({
  size,
  label,
  supporting,
}: {
  size: ControlSize;
  label: ReactNode;
  supporting?: ReactNode;
}) {
  return (
    <span className="flex min-w-0 flex-col">
      <span
        className={`font-medium text-fg group-has-data-disabled/item:text-fg-disabled ${
          size === "sm" ? "text-sm" : "text-md"
        }`}
      >
        {label}
      </span>
      {supporting && (
        <span className="text-sm text-fg-muted group-has-data-disabled/item:text-fg-disabled">
          {supporting}
        </span>
      )}
    </span>
  );
}

/** Fila clickeable: control + texto. El gap y la alineación dependen del tamaño. */
export const itemRow =
  "group/item inline-flex cursor-pointer items-start gap-2 has-data-disabled:cursor-not-allowed";

/** Empuja el control para que quede centrado con la primera línea del label */
export const controlOffset: Record<ControlSize, string> = {
  sm: "mt-0.5",
  md: "mt-0.5",
  lg: "mt-0",
};
