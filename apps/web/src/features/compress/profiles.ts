/** Perfiles de ajustes guardados con nombre (localStorage). */
import { CompressionSpec } from "@prensa/schema";
import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface Profile {
  id: string;
  name: string;
  spec: CompressionSpec;
  createdAt: string;
}

interface ProfilesState {
  profiles: Profile[];
  save: (name: string, spec: CompressionSpec) => Profile;
  remove: (id: string) => void;
}

export const useProfilesStore = create<ProfilesState>()(
  persist(
    (set, get) => ({
      profiles: [],
      save: (name, spec) => {
        const clean = CompressionSpec.parse({ ...spec, password: undefined });
        const trimmed = name.trim().slice(0, 40) || "Perfil";
        const existing = get().profiles.find((p) => p.name.toLowerCase() === trimmed.toLowerCase());
        const profile: Profile = {
          id: existing?.id ?? crypto.randomUUID(),
          name: trimmed,
          spec: clean,
          createdAt: new Date().toISOString(),
        };
        set((s) => ({ profiles: [...s.profiles.filter((p) => p.id !== profile.id), profile] }));
        return profile;
      },
      remove: (id) => set((s) => ({ profiles: s.profiles.filter((p) => p.id !== id) })),
    }),
    {
      name: "prensa:profiles",
      version: 1,
      merge: (persisted, current) => {
        const p = persisted as { profiles?: unknown[] } | undefined;
        const profiles: Profile[] = [];
        for (const raw of p?.profiles ?? []) {
          const r = raw as Partial<Profile>;
          const spec = CompressionSpec.safeParse(r.spec);
          if (r.id && r.name && spec.success) profiles.push({ id: r.id, name: r.name, spec: spec.data, createdAt: r.createdAt ?? "" });
        }
        return { ...current, profiles };
      },
    },
  ),
);
