/** Color y letra por documento de origen (tokens semánticos de Polen, en ciclo). */
export const TONES = [
  { badge: "border-primary-border bg-primary-subtle text-primary-text", bar: "bg-primary", ring: "ring-primary-border" },
  { badge: "border-warning-border bg-warning-subtle text-warning-text", bar: "bg-warning", ring: "ring-warning-border" },
  { badge: "border-success-border bg-success-subtle text-success-text", bar: "bg-success", ring: "ring-success-border" },
  { badge: "border-danger-border bg-danger-subtle text-danger-text", bar: "bg-danger", ring: "ring-danger-border" },
] as const;

export const toneOf = (index: number) => TONES[index % TONES.length]!;
