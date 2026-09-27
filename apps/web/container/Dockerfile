# syntax=docker/dockerfile:1
# Motor pesado de Prensa: Node 24 + Ghostscript + MuPDF + qpdf + ocrmypdf/Tesseract + jbig2enc.
# El runner (container/dist) se empaqueta con esbuild en `pnpm build` (ver container/build.ts).

FROM node:24-trixie-slim AS jbig2enc
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential automake libtool pkg-config libleptonica-dev zlib1g-dev git ca-certificates \
    && rm -rf /var/lib/apt/lists/*
RUN git clone --depth 1 --branch 0.30 https://github.com/agl/jbig2enc.git /tmp/jbig2enc \
    && cd /tmp/jbig2enc && ./autogen.sh && ./configure && make -j"$(nproc)" && make install

FROM node:24-trixie-slim
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends \
    ghostscript mupdf-tools qpdf \
    ocrmypdf tesseract-ocr tesseract-ocr-spa tesseract-ocr-eng tesseract-ocr-por \
    tesseract-ocr-fra tesseract-ocr-deu tesseract-ocr-ita tesseract-ocr-cat \
    pngquant unpaper ca-certificates \
    && rm -rf /var/lib/apt/lists/*
COPY --from=jbig2enc /usr/local/bin/jbig2 /usr/local/bin/jbig2
COPY --from=jbig2enc /usr/local/lib/libjbig2enc* /usr/local/lib/
RUN ldconfig && gs --version && qpdf --version | head -1 && ocrmypdf --version && jbig2 --version 2>&1 | head -1 || true

WORKDIR /app
COPY dist/ ./
ENV NODE_ENV=production PORT=8080 NODE_OPTIONS=--max-old-space-size=5120 TMPDIR=/tmp
EXPOSE 8080
USER node
CMD ["node", "runner.mjs"]
