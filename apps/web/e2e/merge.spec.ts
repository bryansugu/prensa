import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import path from "node:path";

const FIXTURES = path.resolve(import.meta.dirname, "fixtures");
const fixture = (name: string) => path.join(FIXTURES, name);

async function expectNoA11yViolations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).disableRules(["color-contrast"]).analyze();
  const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(serious, JSON.stringify(serious.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target) })), null, 2)).toEqual([]);
}

test.describe("Unir", () => {
  test("compone páginas de dos documentos en el orden elegido, con giro y marcadores", async ({ page }) => {
    await page.goto("/unir");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Une PDF");
    await expectNoA11yViolations(page);

    await page.getByLabel("Elegir archivos PDF").setInputFiles([fixture("doc-1.pdf"), fixture("grafico.pdf")]);
    await expect(page.getByRole("heading", { level: 3, name: "doc-1.pdf" })).toBeVisible();
    await expect(page.getByRole("heading", { level: 3, name: "grafico.pdf" })).toBeVisible();
    const addAll = page.getByRole("button", { name: "Añadir todo al final" });
    await expect(addAll.first()).toBeEnabled({ timeout: 60_000 });
    await expect(addAll.nth(1)).toBeEnabled({ timeout: 60_000 });

    // Todas las páginas de A (2) al resultado.
    await addAll.first().click();
    const items = page.getByRole("list", { name: "Páginas del resultado" }).getByRole("listitem");
    await expect(items).toHaveCount(2);

    // La ilustración (B, página 1) va entre las dos páginas de texto: selección + «insertar en la posición 2».
    await page.getByRole("checkbox", { name: "Seleccionar página 1 de grafico.pdf" }).click();
    await page.getByRole("button", { name: /^Insertar 1 página seleccionada en la posición 2$/ }).click();
    await expect(items).toHaveCount(3);
    await expect(items.nth(1).getByText("B·1")).toBeVisible();
    await expect(items.nth(0).getByText("A·1")).toBeVisible();
    await expect(items.nth(2).getByText("A·2")).toBeVisible();

    // Girar la última y unir.
    await page.getByRole("button", { name: "Girar página 3" }).click();
    await expectNoA11yViolations(page);
    await page.getByRole("button", { name: "Unir 3 páginas" }).click();
    await expect(page.getByRole("button", { name: /Descargar doc-1-unido\.pdf/ })).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText("2 marcadores")).toBeVisible();
  });

  test("arrastrar una página de origen al resultado la inserta donde se suelta", async ({ page }) => {
    // Origen y destino deben estar a la vista: el arrastre es con el ratón real.
    await page.setViewportSize({ width: 1280, height: 1600 });
    await page.goto("/unir");
    await page.getByLabel("Elegir archivos PDF").setInputFiles([fixture("doc-1.pdf"), fixture("grafico.pdf")]);
    const addAll = page.getByRole("button", { name: "Añadir todo al final" });
    await expect(addAll.nth(1)).toBeEnabled({ timeout: 60_000 });
    await addAll.first().click();
    const items = page.getByRole("list", { name: "Páginas del resultado" }).getByRole("listitem");
    await expect(items).toHaveCount(2);

    // Arrastre con puntero (dnd-kit necesita movimientos intermedios).
    const source = page.getByRole("listitem").filter({ has: page.getByRole("checkbox", { name: "Seleccionar página 1 de grafico.pdf" }) }).locator("img");
    await expect(source).toBeVisible({ timeout: 30_000 });
    const from = await source.boundingBox();
    const target = await items.nth(1).locator("img").boundingBox();
    if (!from || !target) throw new Error("sin geometría");
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(from.x + from.width / 2 + 12, from.y + from.height / 2 + 12, { steps: 4 });
    // Mitad izquierda de la segunda página del resultado → se inserta antes de ella (posición 2).
    await page.mouse.move(target.x + target.width * 0.25, target.y + target.height / 2, { steps: 12 });
    await page.mouse.up();
    await expect(items).toHaveCount(3);
    await expect(items.nth(1).getByText("B·1")).toBeVisible();
  });
});
