/**
 * Calienta el servidor de desarrollo antes de los tests: en la primera carga
 * Vite descubre dependencias, las optimiza y recarga la página; si eso ocurre
 * en mitad de un test (los proyectos chromium y mobile arrancan a la vez), el
 * estado de la UI se pierde y el test falla sin motivo real.
 */
import { chromium, type FullConfig } from "@playwright/test";

export default async function warmUp(config: FullConfig): Promise<void> {
  const base = config.projects[0]?.use.baseURL ?? `http://127.0.0.1:${process.env.PORT ?? "5174"}`;
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.goto(base, { waitUntil: "networkidle" });
    await page.waitForTimeout(1500);
    await page.goto(base, { waitUntil: "networkidle" });
  } finally {
    await browser.close();
  }
}
