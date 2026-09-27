import { formatBytes } from "@prensa/schema";
import { Button } from "@/components/ds/button";
import { PRESET_META, formatPercent } from "./presets";
import { useHistoryStore } from "./history";

export function HistoryList() {
  const entries = useHistoryStore((s) => s.entries);
  const clear = useHistoryStore((s) => s.clear);
  if (entries.length === 0) {
    return <p className="pb-2 text-sm text-fg-muted">Todavía no comprimiste nada en este navegador.</p>;
  }
  return (
    <div className="flex flex-col gap-2 pb-2">
      <ul className="flex flex-col divide-y divide-border-subtle" aria-label="Historial">
        {entries.slice(0, 10).map((e) => (
          <li key={e.id} className="flex items-baseline gap-3 py-1.5 text-sm">
            <span className="min-w-0 flex-1 truncate text-fg" title={e.name}>
              {e.name}
            </span>
            <span className="tabular shrink-0 text-fg-muted">
              {formatBytes(e.originalSize)} → {formatBytes(e.outputSize)}
            </span>
            <span className="tabular shrink-0 text-success-text">−{formatPercent(e.savings)}</span>
            <span className="hidden shrink-0 text-xs text-fg-subtle sm:inline" title={new Date(e.at).toLocaleString("es")}>
              {PRESET_META.find((p) => p.id === e.preset)?.label ?? e.preset}
            </span>
          </li>
        ))}
      </ul>
      <p className="text-xs text-fg-subtle">Solo se guardan nombres y tamaños; los archivos nunca salen de tu equipo.</p>
      <div>
        <Button variant="text" size="sm" radius="semi" onClick={clear}>
          Borrar historial
        </Button>
      </div>
    </div>
  );
}
