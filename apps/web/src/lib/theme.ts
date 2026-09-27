import { create } from "zustand";
import { persist } from "zustand/middleware";

export type ThemePreference = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

const STORAGE_KEY = "prensa:theme";
const media = () => window.matchMedia("(prefers-color-scheme: dark)");

export function resolveTheme(pref: ThemePreference): ResolvedTheme {
  if (pref === "system") return media().matches ? "dark" : "light";
  return pref;
}

function apply(pref: ThemePreference) {
  const resolved = resolveTheme(pref);
  document.documentElement.dataset.theme = resolved;
  document.documentElement.style.colorScheme = resolved;
}

interface ThemeState {
  preference: ThemePreference;
  resolved: ResolvedTheme;
  setPreference: (pref: ThemePreference) => void;
  toggle: () => void;
}

export const useTheme = create<ThemeState>()(
  persist(
    (set, get) => ({
      preference: "system",
      resolved: "light",
      setPreference: (preference) => {
        apply(preference);
        set({ preference, resolved: resolveTheme(preference) });
      },
      toggle: () => {
        const next: ThemePreference = get().resolved === "dark" ? "light" : "dark";
        get().setPreference(next);
      },
    }),
    {
      name: STORAGE_KEY,
      // Guardamos solo la preferencia como string plano para que el script inline
      // de index.html pueda leerla sin parsear JSON.
      storage: {
        getItem: (name) => {
          const raw = localStorage.getItem(name);
          if (!raw) return null;
          return { state: { preference: raw as ThemePreference }, version: 0 };
        },
        setItem: (name, value) => {
          localStorage.setItem(name, value.state.preference);
        },
        removeItem: (name) => localStorage.removeItem(name),
      },
      partialize: (s) => ({ preference: s.preference }),
    },
  ),
);

/** Sincroniza data-theme al arrancar y sigue los cambios del sistema. */
export function initTheme() {
  const state = useTheme.getState();
  apply(state.preference);
  useTheme.setState({ resolved: resolveTheme(state.preference) });
  media().addEventListener("change", () => {
    const { preference } = useTheme.getState();
    if (preference === "system") {
      apply("system");
      useTheme.setState({ resolved: resolveTheme("system") });
    }
  });
}
