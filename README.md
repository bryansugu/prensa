# Prensa · Compresor PDF

Comprime PDF con la mejor calidad posible **sin subir nada**: el motor corre en tu navegador (MuPDF +
mozjpeg en WebAssembly). Conserva enlaces, formularios, comentarios y marcadores; mide la calidad de
cada imagen (SSIM) antes de aceptarla; nunca devuelve un archivo más grande que el original.

**Unir** (`/unir`) arma un PDF nuevo página a página a partir de varios documentos: arrastra una
ilustración entre dos páginas de texto, repite, gira o quita hojas, con marcadores por documento y
compresión opcional al terminar.

Una herramienta del [Centro de Diseño y Comunicación](https://cdc.cool), diseñada con su sistema de diseño [Polen](https://polen.cdc.cool). Código abierto bajo AGPL-3.0. En producción: [pdf.cdc.cool](https://pdf.cdc.cool).

## Desarrollo

```bash
nvm use            # Node 24
pnpm install
pnpm ds:sync       # componentes y tokens de Polen
pnpm dev           # http://localhost:5173
pnpm test
```

Más en `CLAUDE.md`, `docs/PLAN.md`, `docs/ARCHITECTURE.md`, `docs/benchmarks.md` (comparación con iLovePDF) y `docs/TOOLS.md` (cómo añadir herramientas).
