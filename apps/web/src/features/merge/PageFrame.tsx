import type { ReactNode } from "react";
import { FileText } from "@/components/app/icons";
import { Skeleton } from "@/components/ds/skeleton";
import { cn } from "@/lib/cn";

interface PageFrameProps {
  thumb: string | null | undefined;
  loading?: boolean;
  rotate?: number;
  className?: string;
  children?: ReactNode;
}

/** Marco de miniatura de página (proporción carta), con giro visual. */
export function PageFrame({ thumb, loading = false, rotate = 0, className, children }: PageFrameProps) {
  return (
    <div className={cn("relative flex aspect-[3/4] w-full items-center justify-center overflow-hidden rounded-md border border-border-subtle bg-surface", className)}>
      {thumb ? (
        <img
          src={thumb}
          alt=""
          draggable={false}
          className="max-h-full max-w-full object-contain transition-transform duration-(--ds-duration-fast)"
          style={rotate ? { transform: `rotate(${rotate}deg) scale(${rotate % 180 ? 0.75 : 1})` } : undefined}
        />
      ) : loading ? (
        <Skeleton variant="rect" width="100%" height="100%" />
      ) : (
        <FileText className="size-6 text-icon-subtle" />
      )}
      {children}
    </div>
  );
}
