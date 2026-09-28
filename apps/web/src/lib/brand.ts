/** Identidad del producto. Cambiar el nombre aquí lo cambia en toda la app. */
export const BRAND = {
  name: "Prensa",
  tagline: "Comprime PDF con la mejor calidad, sin subir nada.",
  host: "pdf.cdc.cool",
  repo: "https://github.com/bryansugu/prensa",
  version: __APP_VERSION__,
  /** Organización que crea y mantiene la herramienta. */
  org: {
    name: "Centro de Diseño y Comunicación",
    short: "CDC",
    url: "https://cdc.cool",
  },
  designSystem: { name: "Polen", url: "https://polen.cdc.cool" },
} as const;
