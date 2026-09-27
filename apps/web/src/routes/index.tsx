import { createFileRoute } from "@tanstack/react-router";
import { CompressPage } from "@/features/compress/CompressPage";

export const Route = createFileRoute("/")({
  component: CompressPage,
});
