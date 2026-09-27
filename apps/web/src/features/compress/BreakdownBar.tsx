import type { SizeBreakdown } from "@prensa/schema";
import { formatPercent } from "./presets";

const SEGMENTS: Array<{ key: keyof SizeBreakdown; label: string; className: string }> = [
  { key: "images", label: "Imágenes", className: "bg-primary" },
  { key: "fonts", label: "Fuentes", className: "bg-info" },
  { key: "content", label: "Contenido", className: "bg-warning" },
  { key: "metadata", label: "Metadatos", className: "bg-neutral-accent" },
  { key: "other", label: "Otros", className: "bg-border-strong" },
];

interface Props {
  breakdown: SizeBreakdown;
  total: number;
  legend?: boolean;
}

export function BreakdownBar({ breakdown, total, legend = true }: Props) {
  const safeTotal = Math.max(1, total);
  const parts = SEGMENTS.map((s) => ({ ...s, fraction: breakdown[s.key] / safeTotal })).filter((p) => p.fraction > 0);
  return (
    <div className="flex flex-col gap-1.5">
      <div
        role="img"
        aria-label={parts.map((p) => `${p.label} ${formatPercent(p.fraction)}`).join(", ")}
        className="flex h-2 w-full overflow-hidden rounded-full bg-surface"
      >
        {parts.map((p) => (
          <span key={p.key} className={p.className} style={{ width: `${Math.max(1, p.fraction * 100)}%` }} />
        ))}
      </div>
      {legend && (
        <ul className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-fg-muted">
          {parts
            .filter((p) => p.fraction >= 0.03)
            .map((p) => (
              <li key={p.key} className="inline-flex items-center gap-1.5">
                <span aria-hidden className={`size-2 rounded-full ${p.className}`} />
                {p.label} <span className="tabular">{formatPercent(p.fraction)}</span>
              </li>
            ))}
        </ul>
      )}
    </div>
  );
}
