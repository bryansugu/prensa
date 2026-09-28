/**
 * Genera los PNG de la PWA y el apple-touch-icon a partir de public/favicon.svg
 * (símbolo del CDC). Se ejecuta a mano cuando cambia la marca: `pnpm icons`.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "@playwright/test";

const root = path.resolve(import.meta.dirname, "..");
const svg = readFileSync(path.join(root, "public/favicon.svg"), "utf8").replace(/<style>[\s\S]*?<\/style>/, "");
const BG = "#fcfcfd";
const FG = "#1e1f24";
/** [archivo, tamaño, proporción del símbolo respecto al lienzo] */
const targets = [
  ["icon-64.png", 64, 0.78],
  ["icon-192.png", 192, 0.74],
  ["icon-512.png", 512, 0.74],
  ["icon-maskable-512.png", 512, 0.52],
  ["apple-touch-icon.png", 180, 0.72],
];

const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 1 });
for (const [file, size, ratio] of targets) {
  const inner = Math.round(size * ratio);
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(
    `<html><body style="margin:0;width:${size}px;height:${size}px;background:${BG};display:grid;place-items:center;color:${FG}">` +
      svg.replace("<svg ", `<svg fill="currentColor" width="${inner}" height="${inner}" `) +
      "</body></html>",
  );
  await page.screenshot({ path: path.join(root, "public", file), clip: { x: 0, y: 0, width: size, height: size } });
  console.log("✓", file);
}
await browser.close();
