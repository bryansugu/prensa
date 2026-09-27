import type { CloudConfig } from "@prensa/schema";
import { useEffect, useState } from "react";
import { fetchCloudConfig } from "./cloud";

/** Configuración pública de la nube (null mientras carga o si no está disponible). */
export function useCloudConfig(): CloudConfig | null {
  const [config, setConfig] = useState<CloudConfig | null>(null);
  useEffect(() => {
    let alive = true;
    void fetchCloudConfig().then((c) => alive && setConfig(c));
    return () => {
      alive = false;
    };
  }, []);
  return config;
}
