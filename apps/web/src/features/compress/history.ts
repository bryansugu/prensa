/** Historial de compresiones (solo metadatos, localStorage). Los archivos nunca se guardan. */
import type { PresetId } from "@prensa/schema";
import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface HistoryEntry {
  id: string;
  name: string;
  originalSize: number;
  outputSize: number;
  savings: number;
  preset: PresetId;
  durationMs: number;
  at: string;
}

interface HistoryState {
  entries: HistoryEntry[];
  add: (entry: HistoryEntry) => void;
  clear: () => void;
}

const MAX = 20;

export const useHistoryStore = create<HistoryState>()(
  persist(
    (set) => ({
      entries: [],
      add: (entry) => set((s) => ({ entries: [entry, ...s.entries.filter((e) => e.id !== entry.id)].slice(0, MAX) })),
      clear: () => set({ entries: [] }),
    }),
    { name: "prensa:history", version: 1 },
  ),
);
