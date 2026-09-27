import { expect, test } from "@playwright/test";
import path from "node:path";

const FIXTURES = path.resolve(import.meta.dirname, "fixtures");

test("móvil: ajustes en drawer y barra inferior", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.getByLabel("Elegir archivos PDF").setInputFiles([path.join(FIXTURES, "doc-3.pdf")]);
  await expect(page.getByText("doc-3.pdf")).toBeVisible();
  await expect(page.getByRole("button", { name: "Comprimir 1 archivo" })).toBeEnabled({ timeout: 60_000 });
  await page.getByRole("button", { name: "Ajustes" }).click();
  const drawer = page.getByRole("dialog", { name: "Ajustes" });
  await expect(drawer.getByRole("radio", { name: /Inteligente/ })).toBeVisible();
  await drawer.getByRole("radio", { name: /Pantalla/ }).click();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Comprimir 1 archivo" }).click();
  await expect(page.getByText("1 archivo listo")).toBeVisible({ timeout: 90_000 });
  // Sin scroll horizontal
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  expect(overflow).toBe(false);
});
