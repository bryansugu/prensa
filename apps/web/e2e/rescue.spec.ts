import { expect, test } from "@playwright/test";
import path from "node:path";

const FIXTURES = path.resolve(import.meta.dirname, "fixtures");

test("rescate automático: si el navegador se queda sin memoria, el archivo continúa en la nube", async ({ page }) => {
  // `?simular-oom` (solo en desarrollo) hace que la compresión local falle por memoria.
  await page.goto("/?simular-oom");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.getByLabel("Elegir archivos PDF").setInputFiles([path.join(FIXTURES, "doc-1.pdf")]);
  await expect(page.getByRole("button", { name: "Comprimir 1 archivo" })).toBeEnabled({ timeout: 60_000 });
  await page.getByRole("button", { name: "Comprimir 1 archivo" }).click();
  // Con nube disponible aparece el aviso de rescate; sin nube, la alerta explica el límite de memoria.
  await expect(page.getByText(/se quedó sin memoria/i).first()).toBeVisible({ timeout: 30_000 });
  // Nunca queda "colgado" comprimiendo.
  await expect(page.getByRole("button", { name: "Cancelar" })).toHaveCount(0, { timeout: 30_000 });
});
