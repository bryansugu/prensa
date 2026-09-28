import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { useEffect, useState } from "react";
import { Dropzone } from "@/components/app/Dropzone";
import { mergeApi } from "./engine";
import { MergeBar } from "./MergeBar";
import { BOARD_ID, OutputBoard } from "./OutputBoard";
import { PageFrame } from "./PageFrame";
import { SourceStrip } from "./SourceStrip";
import { selKey, useMergeStore } from "./store";

type ActiveDrag = { type: "source"; source: string; page: number } | { type: "output"; key: string };

const DEFAULT_TITLE = "Prensa · Compresor PDF · Centro de Diseño";

export function MergePage() {
  const sources = useMergeStore((s) => s.sources);
  const sequence = useMergeStore((s) => s.sequence);
  const selected = useMergeStore((s) => s.selected);
  const addFiles = useMergeStore((s) => s.addFiles);
  const insertRefs = useMergeStore((s) => s.insertRefs);
  const insertSelected = useMergeStore((s) => s.insertSelected);
  const movePage = useMergeStore((s) => s.movePage);
  const [active, setActive] = useState<ActiveDrag | null>(null);

  useEffect(() => {
    document.title = "Unir PDF · Prensa · Centro de Diseño";
    void mergeApi().warmup().catch(() => undefined);
    return () => {
      document.title = DEFAULT_TITLE;
    };
  }, []);

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const list = e.clipboardData?.files;
      if (list && list.length) addFiles(Array.from(list));
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [addFiles]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const onDragStart = (e: DragStartEvent) => setActive((e.active.data.current as ActiveDrag | undefined) ?? null);

  const onDragEnd = (e: DragEndEvent) => {
    const data = e.active.data.current as ActiveDrag | undefined;
    setActive(null);
    if (!data) return;
    const { over } = e;
    if (data.type === "source") {
      if (!over) return;
      let at: number | null = null;
      if (over.id !== BOARD_ID) {
        const overIndex = sequence.findIndex((p) => p.key === over.id);
        if (overIndex < 0) return;
        const a = e.active.rect.current.translated;
        const after = a ? a.left + a.width / 2 > over.rect.left + over.rect.width / 2 : false;
        at = overIndex + (after ? 1 : 0);
      }
      // Si la página arrastrada está seleccionada, se insertan todas las seleccionadas.
      if (selected.includes(selKey(data))) insertSelected(at);
      else insertRefs([{ source: data.source, page: data.page }], at);
      return;
    }
    if (!over || over.id === data.key) return;
    const from = sequence.findIndex((p) => p.key === data.key);
    const to = sequence.findIndex((p) => p.key === over.id);
    if (from >= 0 && to >= 0) movePage(from, to);
  };

  const overlayThumb = (() => {
    if (!active) return null;
    if (active.type === "source") return sources.find((s) => s.id === active.source)?.thumbs[active.page] ?? null;
    const page = sequence.find((p) => p.key === active.key);
    return page ? (sources.find((s) => s.id === page.source)?.thumbs[page.page] ?? null) : null;
  })();

  if (sources.length === 0) {
    return (
      <section className="mx-auto flex max-w-4xl flex-col gap-10 px-4 py-12 sm:px-6 sm:py-20">
        <div className="flex flex-col gap-4 text-center">
          <h1 className="text-heading-xs font-semibold tracking-tight text-fg sm:text-heading-md">Une PDF página por página</h1>
          <p className="mx-auto max-w-2xl text-lg text-fg-muted">
            Sube varios PDF, mira sus páginas y arma el documento final en el orden exacto que quieras: intercala, repite, gira y
            quita páginas. Todo en tu dispositivo.
          </p>
        </div>
        <Dropzone onFiles={addFiles} hint="o haz clic para elegirlos · hasta 20 documentos · también puedes pegarlos" />
        <ul className="grid gap-4 text-sm text-fg-muted sm:grid-cols-3">
          <li className="rounded-xl border border-border-subtle bg-bg-subtle p-4">
            <p className="font-semibold text-fg">Página a página</p>
            Cada documento se abre con sus miniaturas; eliges páginas sueltas o todas.
          </li>
          <li className="rounded-xl border border-border-subtle bg-bg-subtle p-4">
            <p className="font-semibold text-fg">Donde tú digas</p>
            Arrastra una ilustración entre dos páginas de texto, repite una portada, gira una hoja apaisada.
          </li>
          <li className="rounded-xl border border-border-subtle bg-bg-subtle p-4">
            <p className="font-semibold text-fg">Listo para entregar</p>
            Marcadores por documento y, si quieres, compresión Inteligente al terminar.
          </li>
        </ul>
      </section>
    );
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setActive(null)}>
      <section className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6 sm:py-8">
        <div className="flex flex-col gap-1">
          <h1 className="text-heading-xs font-semibold tracking-tight text-fg">Unir PDF</h1>
          <p className="text-md text-fg-muted">
            Marca o arrastra páginas de los documentos hacia el resultado. Ahí se reordenan arrastrando o con el teclado (espacio y
            flechas); cada página se puede girar, duplicar o quitar.
          </p>
        </div>
        <Dropzone compact onFiles={addFiles} hint="Añadir más documentos (hasta 20)" />
        <div className="flex flex-col gap-4" aria-label="Documentos de origen">
          {sources.map((s) => (
            <SourceStrip key={s.id} source={s} />
          ))}
        </div>
        <OutputBoard />
      </section>
      <MergeBar />
      <DragOverlay dropAnimation={null}>
        {active && (
          <div className="w-28 rotate-2 rounded-md shadow-lg sm:w-32">
            <PageFrame thumb={overlayThumb} />
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}
