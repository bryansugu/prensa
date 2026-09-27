import { useId, useRef, useState, type DragEvent, type KeyboardEvent } from "react";
import { UploadCloud } from "@/components/app/icons";
import { Shield } from "@/components/app/icons";
import { cn } from "@/lib/cn";

interface DropzoneProps {
  compact?: boolean;
  onFiles: (files: File[]) => void;
}

function filesFromDataTransfer(dt: DataTransfer): File[] {
  return Array.from(dt.files);
}

export function Dropzone({ compact = false, onFiles }: DropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const inputId = useId();

  const open = () => inputRef.current?.click();

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(false);
    const files = filesFromDataTransfer(e.dataTransfer);
    if (files.length) onFiles(files);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      open();
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      aria-describedby={`${inputId}-hint`}
      onClick={open}
      onKeyDown={onKeyDown}
      onDragOver={(e) => {
        e.preventDefault();
        if (!dragging) setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      className={cn(
        "group relative flex w-full cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed text-center outline-none transition-colors duration-(--ds-duration-fast) ease-move",
        "focus-visible:shadow-[0_0_0_2px_var(--bg),0_0_0_4px_var(--focus-ring)]",
        dragging
          ? "border-primary bg-primary-subtle"
          : "border-border bg-bg-elevated hover:border-primary-border hover:bg-primary-faint",
        compact ? "gap-3 px-5 py-5 sm:flex-row sm:justify-start sm:text-left" : "gap-4 px-6 py-14 sm:py-20",
      )}
    >
      <input
        ref={inputRef}
        id={inputId}
        type="file"
        accept="application/pdf,.pdf"
        multiple
        className="sr-only"
        tabIndex={-1}
        onChange={(e) => {
          const files = e.target.files ? Array.from(e.target.files) : [];
          if (files.length) onFiles(files);
          e.target.value = "";
        }}
      />
      <span
        aria-hidden
        className={cn(
          "grid shrink-0 place-items-center rounded-full bg-primary-subtle text-primary-accent transition-transform duration-(--ds-duration-base) ease-enter group-hover:-translate-y-0.5",
          compact ? "size-11 text-[22px]" : "size-16 text-[32px]",
        )}
      >
        <UploadCloud />
      </span>
      <div className="flex flex-col gap-1">
        <p className={cn("font-semibold text-fg", compact ? "text-md" : "text-xl")}>
          {dragging ? "Suelta para agregar" : compact ? "Agregar más PDF" : "Arrastra tus PDF aquí"}
        </p>
        <p id={`${inputId}-hint`} className={cn("text-fg-muted", compact ? "text-sm" : "text-md")}>
          o haz clic para elegirlos · hasta 50 archivos · también puedes pegarlos
        </p>
      </div>
      {!compact && (
        <p className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-primary-border bg-primary-faint px-3 py-1 text-sm font-medium text-primary-text">
          <Shield className="size-4" />
          Se procesa en tu dispositivo · nada se sube a internet
        </p>
      )}
    </div>
  );
}
