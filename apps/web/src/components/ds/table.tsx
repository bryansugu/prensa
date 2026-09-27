import type { ComponentProps, ReactNode } from "react";

/**
 * Table — componente NUEVO. Datos tabulares que se comparan y ordenan.
 * Piezas semánticas (<table>, <thead>…) con el estilo del sistema; ordenar,
 * paginar y seleccionar se componen desde afuera (Pagination, Checkbox).
 *   fila 48 (sm 40) · padding X 16 · encabezado Text xs/Medium text/muted MAYÚSC.
 *   celda Text sm text/default · divisores border/subtle · hover bg/subtle
 *   contenedor radius-xl + border/default, scroll horizontal si no entra
 */
export function Table({ size = "md", className = "", ...props }: ComponentProps<"table"> & { size?: "sm" | "md" }) {
  return (
    <div className="w-full overflow-x-auto rounded-xl border border-border bg-bg-elevated">
      <table
        {...props}
        className={`w-full border-collapse text-sm text-fg ${size === "sm" ? "[&_td]:h-10 [&_th]:h-9" : "[&_td]:h-12 [&_th]:h-10"} ${className}`.trim()}
      />
    </div>
  );
}

export function TableHead({ className = "", ...props }: ComponentProps<"thead">) {
  return <thead {...props} className={`bg-bg-subtle ${className}`.trim()} />;
}

export function TableBody(props: ComponentProps<"tbody">) {
  return <tbody {...props} className="divide-y divide-border-subtle" />;
}

export function TableRow({ selected, className = "", ...props }: ComponentProps<"tr"> & { selected?: boolean }) {
  return (
    <tr
      {...props}
      aria-selected={selected || undefined}
      className={`transition-colors hover:bg-bg-subtle aria-selected:bg-primary-faint ${className}`.trim()}
    />
  );
}

export interface TableHeaderProps extends ComponentProps<"th"> {
  align?: "left" | "right" | "center";
  /** Estado de orden de esta columna; el clic lo maneja quien usa la tabla */
  sort?: "asc" | "desc" | "none";
  onSort?: () => void;
}

export function TableHeader({ align = "left", sort, onSort, className = "", children, ...props }: TableHeaderProps) {
  const alignCls = { left: "text-left", right: "text-right", center: "text-center" }[align];
  const sortable = sort !== undefined;
  return (
    <th
      {...props}
      scope="col"
      aria-sort={sort === "asc" ? "ascending" : sort === "desc" ? "descending" : sortable ? "none" : undefined}
      className={`whitespace-nowrap px-4 text-xs font-medium tracking-sm text-fg-muted uppercase ${alignCls} ${className}`.trim()}
    >
      {sortable ? (
        <button
          type="button"
          onClick={onSort}
          className={`inline-flex items-center gap-1 rounded-xs uppercase hover:text-fg focus-visible:shadow-[0_0_0_2px_var(--focus-ring)] focus-visible:outline-none ${align === "right" ? "flex-row-reverse" : ""}`}
        >
          {children}
          <span aria-hidden className={`text-[10px] ${sort === "none" ? "text-fg-subtle" : "text-fg"}`}>
            {sort === "asc" ? "▲" : sort === "desc" ? "▼" : "↕"}
          </span>
        </button>
      ) : (
        children
      )}
    </th>
  );
}

export function TableCell({ align = "left", numeric, className = "", ...props }: ComponentProps<"td"> & { align?: "left" | "right" | "center"; numeric?: boolean }) {
  const alignCls = { left: "text-left", right: "text-right", center: "text-center" }[numeric ? "right" : align];
  return <td {...props} className={`px-4 ${alignCls} ${numeric ? "font-mono tabular-nums" : ""} ${className}`.trim()} />;
}

/** Fila de carga / vacío que ocupa todas las columnas */
export function TableEmpty({ colSpan, children }: { colSpan: number; children: ReactNode }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-4 py-10 text-center text-sm text-fg-muted">
        {children}
      </td>
    </tr>
  );
}
