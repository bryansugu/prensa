import { useDraggable } from "@dnd-kit/core";
import { formatBytes } from "@prensa/schema";
import { Trash } from "@/components/app/icons";
import { Badge } from "@/components/ds/badge";
import { Button } from "@/components/ds/button";
import { Checkbox } from "@/components/ds/checkbox";
import { Skeleton } from "@/components/ds/skeleton";
import { Tooltip } from "@/components/ds/tooltip";
import { cn } from "@/lib/cn";
import { PageFrame } from "./PageFrame";
import { letterOf, selKey, useMergeStore, type Source } from "./store";
import { toneOf } from "./tones";

export const sourceDragId = (source: string, page: number) => `src|${source}|${page}`;

function SourcePageTile({ source, page }: { source: Source; page: number }) {
  const selected = useMergeStore((s) => s.selected.includes(selKey({ source: source.id, page })));
  const toggleSelected = useMergeStore((s) => s.toggleSelected);
  const insertRefs = useMergeStore((s) => s.insertRefs);
  const { setNodeRef, listeners, isDragging } = useDraggable({
    id: sourceDragId(source.id, page),
    data: { type: "source", source: source.id, page },
  });
  const tone = toneOf(source.index);
  return (
    <li ref={setNodeRef} className={cn("relative w-24 shrink-0 select-none sm:w-28", isDragging && "opacity-40")}>
      {/* La imagen es el asa de arrastre (solo puntero); el teclado usa la casilla + «Insertar». */}
      <div
        {...listeners}
        aria-hidden
        onDoubleClick={() => insertRefs([{ source: source.id, page }], null)}
        className={cn("cursor-grab touch-none active:cursor-grabbing", selected && `rounded-md ring-2 ring-offset-2 ring-offset-bg-elevated ${tone.ring}`)}
      >
        <PageFrame thumb={source.thumbs[page]} loading={source.status === "ready" && page < 400} />
      </div>
      <div className="absolute top-1.5 left-1.5">
        <Checkbox
          size="sm"
          aria-label={`Seleccionar página ${page + 1} de ${source.name}`}
          checked={selected}
          onCheckedChange={() => toggleSelected({ source: source.id, page })}
          className="shadow-xs"
        />
      </div>
      <p className="mt-1 text-center text-xs text-fg-muted tabular">{page + 1}</p>
    </li>
  );
}

export function SourceStrip({ source }: { source: Source }) {
  const appendAll = useMergeStore((s) => s.appendAll);
  const selectAll = useMergeStore((s) => s.selectAll);
  const removeSource = useMergeStore((s) => s.removeSource);
  const selectedCount = useMergeStore((s) => s.selected.filter((k) => k.startsWith(`${source.id}:`)).length);
  const tone = toneOf(source.index);
  const letter = letterOf(source.index);
  const headingId = `src-${source.id}`;

  return (
    <section aria-labelledby={headingId} className="rounded-2xl border border-border bg-bg-elevated p-3 sm:p-4">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <Badge size="sm" radius="semi" className={tone.badge} aria-label={`Documento ${letter}`}>
          {letter}
        </Badge>
        <h3 id={headingId} className="min-w-0 flex-1 truncate text-md font-semibold text-fg" title={source.name}>
          {source.name}
        </h3>
        <p className="text-sm text-fg-muted">
          <span className="tabular">{formatBytes(source.size)}</span>
          {source.status === "ready" && (
            <>
              {" · "}
              {source.pageCount} {source.pageCount === 1 ? "página" : "páginas"}
            </>
          )}
          {selectedCount > 0 && <> · {selectedCount} seleccionadas</>}
        </p>
        <div className="flex items-center gap-1.5 sm:ml-auto">
          <Button size="sm" variant="tonal" disabled={source.status !== "ready"} onClick={() => appendAll(source.id)}>
            Añadir todo al final
          </Button>
          <Button size="sm" variant="text" disabled={source.status !== "ready"} onClick={() => selectAll(source.id)}>
            {selectedCount === source.pageCount && source.pageCount > 0 ? "Quitar selección" : "Seleccionar todo"}
          </Button>
          <Tooltip content="Quitar documento">
            <Button size="sm" variant="text" iconOnly={<Trash />} aria-label={`Quitar ${source.name}`} onClick={() => removeSource(source.id)} />
          </Tooltip>
        </div>
      </header>

      {source.status === "error" ? (
        <p role="alert" className="mt-3 text-sm text-danger-text">
          {source.error}
        </p>
      ) : source.status === "opening" ? (
        <div className="mt-3 flex gap-3 overflow-hidden" aria-busy="true" aria-label="Abriendo documento">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="w-24 shrink-0 sm:w-28">
              <Skeleton variant="rect" width="100%" height={112} />
            </div>
          ))}
        </div>
      ) : (
        <ul className="mt-3 flex gap-3 overflow-x-auto pt-1 pb-2" aria-label={`Páginas de ${source.name}`}>
          {Array.from({ length: source.pageCount }, (_, p) => (
            <SourcePageTile key={p} source={source} page={p} />
          ))}
        </ul>
      )}
    </section>
  );
}
