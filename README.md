# Prensa · Compresor PDF

Comprime PDF con la mejor calidad posible **sin subir nada**: el motor corre en tu navegador (MuPDF +
mozjpeg en WebAssembly). Conserva enlaces, formularios, comentarios y marcadores; mide la calidad de
cada imagen (SSIM) antes de aceptarla; nunca devuelve un archivo más grande que el original.

Diseñado con [Polen](https://polen.cdc.cool). Código abierto bajo AGPL-3.0.

## Desarrollo

```bash
nvm use            # Node 24
pnpm install
pnpm ds:sync       # componentes y tokens de Polen
pnpm dev           # http://localhost:5173
pnpm test
```

Más en `CLAUDE.md` y `docs/PLAN.md`.
