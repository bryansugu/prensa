import { createFileRoute } from "@tanstack/react-router";
import { MergePage } from "@/features/merge/MergePage";

export const Route = createFileRoute("/unir")({
  component: MergePage,
});
