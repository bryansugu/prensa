import { useDroppable } from "@dnd-kit/core";
import { SortableContext, rectSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Copy, RotateCw, Trash } from "@/components/app/icons";
import { Badge } from "@/components/ds/badge";
import { Button } from "@/components/ds/button";
import { EmptyState } from "@/components/ds/empty-state";
import { DotsVertical, Plus } from "@/components/ds/icons";
import { Menu, MenuItem, MenuSeparator } from "@/components/ds/menu";
import { Tooltip } from "@/components/ds/tooltip";
import { cn } from "@/lib/cn";
import { PageFrame } from "./PageFrame";
import { letterOf, useMergeStore, type OutputPage } from "./store";
import { toneOf } from "./tones";

export const BOARD_ID = "board";

function InsertGap({ at, count, className }: { at: number; count: number; className?: string }) {
  const insertSelected = useMergeStore((s) => s.insertSelected);
  return (
    <Tooltip content={`Insertar aquí (posición ${at + 1})`}>
      <button
        type="button"
        aria-label={`Insertar ${count} ${count === 1 ? "página seleccionada" : "páginas seleccionadas"} en la posición ${at + 1}`}
        onClick={() => insertSelected(at)}
        className={cn(
          "absolute top-1/2 z-10 flex size-6 -translate-y-1/2 items-center justify-center rounded-full border border-primary-border bg-bg-elevated text-primary-accent shadow-xs transition-colors hover:bg-primary-subtle focus-visible:shadow-[0_0_0_2px_var(--focus-ring)] focus-visible:outline-none [&_svg]:size-3.5",
          className,
        )}
      >
        <Plus />
      </button>
    </Tooltip>
  );
}

function OutputTile({ page, index, total, showGaps, gapCount }: { page: OutputPage; index: number; total: number; showGaps: boolean; gapCount: number }) {
  const source = useMergeStore((s) => s.sources.find((x) => x.id === page.source));
  const movePage = useMergeStore((s) => s.movePage);
  const removePage = useMergeStore((s) => s.removePage);
  const rotatePage = useMergeStore((s) => s.rotatePage);
  const duplicatePage = useMergeStore((s) => s.duplicatePage);
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: page.key,
    data: { type: "output", key: page.key },
  });
  const tone = toneOf(source?.index ?? 0);
  const letter = letterOf(source?.index ?? 0);
  const label = `Página ${index + 1} del resultado: ${letter} pág. ${page.page + 1}${page.rotate ? `, girada ${page.rotate}°` : ""}`;

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn("relative w-28 shrink-0 sm:w-32", isDragging && "z-20 opacity-60")}
    >
      {showGaps && <InsertGap at={index} count={gapCount} className="-left-3" />}
      {showGaps && index === total - 1 && <InsertGap at={index + 1} count={gapCount} className="-right-3" />}
      <div
        ref={setActivatorNodeRef}
        {...listeners}
        {...attributes}
        aria-label={`${label}. Espacio para mover con las flechas`}
        className="cursor-grab touch-none rounded-md outline-none focus-visible:shadow-[0_0_0_2px_var(--bg),0_0_0_4px_var(--focus-ring)] active:cursor-grabbing"
      >
        <PageFrame thumb={source?.thumbs[page.page]} loading={!!source && source.status === "ready"} rotate={page.rotate}>
          <span className={cn("absolute inset-x-0 top-0 h-1", tone.bar)} aria-hidden />
        </PageFrame>
      </div>
      <div className="mt-1 flex items-center justify-between gap-1">
        <Badge size="sm" radius="semi" className={cn("tabular", tone.badge)} aria-label={`${letter} página ${page.page + 1}`}>
          {letter}·{page.page + 1}
        </Badge>
        <span className="text-xs text-fg-muted tabular">{index + 1}</span>
        <div className="flex items-center">
          <Tooltip content="Girar 90°">
            <Button size="sm" variant="text" iconOnly={<RotateCw />} aria-label={`Girar página ${index + 1}`} onClick={() => rotatePage(page.key)} />
          </Tooltip>
          <Menu
            trigger={
              <Button size="sm" variant="text" iconOnly={<DotsVertical />} aria-label={`Más acciones para la página ${index + 1}`} />
            }
            align="end"
          >
            <MenuItem icon={<Copy />} onClick={() => duplicatePage(page.key)}>
              Duplicar
            </MenuItem>
            <MenuItem disabled={index === 0} onClick={() => movePage(index, 0)}>
              Mover al inicio
            </MenuItem>
            <MenuItem disabled={index === 0} onClick={() => movePage(index, index - 1)}>
              Mover una atrás
            </MenuItem>
            <MenuItem disabled={index === total - 1} onClick={() => movePage(index, index + 1)}>
              Mover una adelante
            </MenuItem>
            <MenuItem disabled={index === total - 1} onClick={() => movePage(index, total - 1)}>
              Mover al final
            </MenuItem>
            <MenuSeparator />
            <MenuItem destructive icon={<Trash />} onClick={() => removePage(page.key)}>
              Quitar del resultado
            </MenuItem>
          </Menu>
        </div>
      </div>
    </li>
  );
}

export function OutputBoard() {
  const sequence = useMergeStore((s) => s.sequence);
  const selectedCount = useMergeStore((s) => s.selected.length);
  const insertSelected = useMergeStore((s) => s.insertSelected);
  const clearSelection = useMergeStore((s) => s.clearSelection);
  const clearSequence = useMergeStore((s) => s.clearSequence);
  const { setNodeRef, isOver } = useDroppable({ id: BOARD_ID });
  const showGaps = selectedCount > 0;

  return (
    <section aria-labelledby="resultado-titulo" className="flex flex-col gap-3">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h2 id="resultado-titulo" className="text-lg font-semibold text-fg">
          Resultado
        </h2>
        <p className="text-sm text-fg-muted" aria-live="polite">
          {sequence.length === 0 ? "Sin páginas" : `${sequence.length} ${sequence.length === 1 ? "página" : "páginas"}`}
        </p>
        <div className="flex flex-wrap items-center gap-1.5 sm:ml-auto">
          {showGaps && (
            <>
              <Button size="sm" variant="tonal" onClick={() => insertSelected(null)}>
                Añadir {selectedCount} {selectedCount === 1 ? "seleccionada" : "seleccionadas"} al final
              </Button>
              <Button size="sm" variant="text" onClick={clearSelection}>
                Deseleccionar
              </Button>
            </>
          )}
          <Button size="sm" variant="text" disabled={sequence.length === 0} onClick={clearSequence}>
            Vaciar
          </Button>
        </div>
      </header>
      {showGaps && (
        <p className="text-sm text-primary-text">
          Pulsa un «+» entre las páginas del resultado para insertar ahí las {selectedCount} seleccionadas, o arrástralas.
        </p>
      )}
      <div
        ref={setNodeRef}
        className={cn(
          "min-h-44 rounded-2xl border-2 border-dashed p-3 transition-colors duration-(--ds-duration-fast) sm:p-4",
          isOver ? "border-primary bg-primary-faint" : "border-border bg-bg-subtle",
        )}
      >
        {sequence.length === 0 ? (
          <EmptyState
            size="sm"
            title="Aquí se arma tu PDF"
            description="Arrastra páginas desde los documentos de arriba (o márcalas y usa «Añadir»). Puedes mezclarlas, repetirlas y girarlas."
          />
        ) : (
          <SortableContext items={sequence.map((p) => p.key)} strategy={rectSortingStrategy}>
            <ol className={cn("flex flex-wrap gap-y-4", showGaps ? "gap-x-7 px-3" : "gap-x-3")} aria-label="Páginas del resultado">
              {sequence.map((p, i) => (
                <OutputTile key={p.key} page={p} index={i} total={sequence.length} showGaps={showGaps} gapCount={selectedCount} />
              ))}
            </ol>
          </SortableContext>
        )}
      </div>
    </section>
  );
}
