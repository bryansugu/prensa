/**
 * Spinner — componente NUEVO. Espera indeterminada y corta (< 10 s); para
 * esperas largas o con porcentaje, Progress; para contenido que va a aparecer
 * con forma conocida, Skeleton.
 *   16 / 20 / 24 / 32 · trazo 2.5 · pista al 25% + arco en currentColor
 *   Hereda el color del texto: en un Button Fill sale blanco, suelto es primary/accent.
 */
export type SpinnerSize = "sm" | "md" | "lg" | "xl";

const sizes: Record<SpinnerSize, string> = { sm: "size-4", md: "size-5", lg: "size-6", xl: "size-8" };

export function Spinner({ size = "md", label = "Cargando", className = "" }: { size?: SpinnerSize; label?: string; className?: string }) {
  return (
    <span role="status" aria-label={label} className={`inline-flex text-primary-accent ${className}`.trim()}>
      <svg viewBox="0 0 24 24" fill="none" className={`animate-spin motion-reduce:animate-none ${sizes[size]}`} aria-hidden>
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" opacity="0.25" />
        <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      </svg>
    </span>
  );
}
