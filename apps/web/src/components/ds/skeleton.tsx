/**
 * Skeleton — componente NUEVO. Placeholder con la forma del contenido que
 * está por llegar. Reserva el espacio, así nada salta al cargar.
 *   bg/surface con brillo animado · radius-sm (text) · radius-md (rect) · full (circle)
 *   Sin animación con prefers-reduced-motion. Se marca aria-hidden: el estado
 *   de carga lo anuncia el contenedor (aria-busy), no cada hueso.
 */
export interface SkeletonProps {
  variant?: "text" | "rect" | "circle";
  /** Ancho y alto en cualquier unidad CSS. text usa 1em de alto por defecto */
  width?: string | number;
  height?: string | number;
  className?: string;
}

const shapes = { text: "h-[1em] rounded-sm", rect: "rounded-md", circle: "rounded-full" };

export function Skeleton({ variant = "text", width, height, className = "" }: SkeletonProps) {
  return (
    <span
      aria-hidden
      className={`block animate-pulse bg-surface motion-reduce:animate-none ${shapes[variant]} ${className}`.trim()}
      style={{ width, height }}
    />
  );
}
