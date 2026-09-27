/**
 * Íconos adicionales en el estilo FDS/Polen (grilla 20×20, stroke 1.667,
 * currentColor). Los del sistema viven en components/ds/icons.tsx (generado).
 */
import type { SVGProps } from "react";

function Icon({ children, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 20 20"
      width="1em"
      height="1em"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.66667"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...props}
    >
      {children}
    </svg>
  );
}

export const UploadCloud = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="M6.5 15.5A4 4 0 0 1 6 7.55a5 5 0 0 1 9.6 1.2A3.5 3.5 0 0 1 14.5 15.5" />
    <path d="M10 10.5v6.5M7.5 13l2.5-2.5 2.5 2.5" />
  </Icon>
);
export const FileText = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="M11.5 2.5H6a1.5 1.5 0 0 0-1.5 1.5v12A1.5 1.5 0 0 0 6 17.5h8a1.5 1.5 0 0 0 1.5-1.5V6.5l-4-4Z" />
    <path d="M11.5 2.5v4h4M7.5 10.5h5M7.5 13.5h5" />
  </Icon>
);
export const Download = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="M3.5 13.5v2A1.5 1.5 0 0 0 5 17h10a1.5 1.5 0 0 0 1.5-1.5v-2M10 3v9.5M6.5 9l3.5 3.5L13.5 9" />
  </Icon>
);
export const Trash = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="M3.5 5.5h13M8 5.5V4a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v1.5M5.5 5.5l.7 10a1.5 1.5 0 0 0 1.5 1.4h4.6a1.5 1.5 0 0 0 1.5-1.4l.7-10M8.5 9v5M11.5 9v5" />
  </Icon>
);
export const Lock = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <rect x="4" y="9" width="12" height="8.5" rx="1.5" />
    <path d="M6.5 9V6.5a3.5 3.5 0 0 1 7 0V9M10 12.5v2" />
  </Icon>
);
export const Link = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="M8.5 11.5a3.5 3.5 0 0 0 4.95 0l2-2a3.5 3.5 0 0 0-4.95-4.95l-.75.75" />
    <path d="M11.5 8.5a3.5 3.5 0 0 0-4.95 0l-2 2a3.5 3.5 0 0 0 4.95 4.95l.75-.75" />
  </Icon>
);
export const Layers = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="m10 2.5 7 3.5-7 3.5-7-3.5 7-3.5Z" />
    <path d="m3 10 7 3.5 7-3.5M3 14l7 3.5 7-3.5" />
  </Icon>
);
export const Bookmark = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="M5 3.5A1.5 1.5 0 0 1 6.5 2h7A1.5 1.5 0 0 1 15 3.5V17.5l-5-3.5-5 3.5V3.5Z" />
  </Icon>
);
export const FormField = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <rect x="2.5" y="5" width="15" height="10" rx="1.5" />
    <path d="M5.5 10h5M13 8.5v3" />
  </Icon>
);
export const Sparkles = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="M10 3v3M10 14v3M3 10h3M14 10h3M5.5 5.5l1.8 1.8M12.7 12.7l1.8 1.8M14.5 5.5l-1.8 1.8M7.3 12.7l-1.8 1.8" />
    <circle cx="10" cy="10" r="2" />
  </Icon>
);
export const ImageIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <rect x="2.5" y="3.5" width="15" height="13" rx="1.5" />
    <circle cx="7" cy="8" r="1.5" />
    <path d="m17.5 13-4-4-7 7.5" />
  </Icon>
);
export const Printer = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="M6 7.5V3.5h8v4M6 15.5H4a1.5 1.5 0 0 1-1.5-1.5V9A1.5 1.5 0 0 1 4 7.5h12A1.5 1.5 0 0 1 17.5 9v5a1.5 1.5 0 0 1-1.5 1.5h-2" />
    <rect x="6" y="12.5" width="8" height="5" rx="1" />
  </Icon>
);
export const Monitor = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <rect x="2.5" y="3.5" width="15" height="10" rx="1.5" />
    <path d="M7 17h6M10 13.5V17" />
  </Icon>
);
export const Archive = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <rect x="2.5" y="3.5" width="15" height="4" rx="1" />
    <path d="M4 7.5v8A1.5 1.5 0 0 0 5.5 17h9a1.5 1.5 0 0 0 1.5-1.5v-8M8 11h4" />
  </Icon>
);
export const Shield = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="M10 2.5 3.5 5v5c0 4 2.8 6.5 6.5 7.5 3.7-1 6.5-3.5 6.5-7.5V5L10 2.5Z" />
    <path d="m7.5 10 1.8 1.8L12.8 8" />
  </Icon>
);
export const Feather = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="M16.5 3.5c-4 0-9 2-10.5 8L3.5 16.5M6 11.5h5M8.5 8.5c3.3-.5 6.5-2 8-5-1 4-3 7.5-7.5 9.5" />
  </Icon>
);
export const Scan = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="M3 7V4.5A1.5 1.5 0 0 1 4.5 3H7M13 3h2.5A1.5 1.5 0 0 1 17 4.5V7M17 13v2.5a1.5 1.5 0 0 1-1.5 1.5H13M7 17H4.5A1.5 1.5 0 0 1 3 15.5V13M3 10h14" />
  </Icon>
);
export const Refresh = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="M16.5 8A7 7 0 0 0 4.2 6.2M3.5 3.5v3.2h3.2M3.5 12a7 7 0 0 0 12.3 1.8M16.5 16.5v-3.2h-3.2" />
  </Icon>
);
export const Type = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="M4 6V3.5h12V6M10 3.5v13M7.5 16.5h5" />
  </Icon>
);
export const Cloud = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="M6 16.5A4 4 0 0 1 5.5 8.55a5 5 0 0 1 9.6 1.2A3.5 3.5 0 0 1 15 16.5H6Z" />
  </Icon>
);
