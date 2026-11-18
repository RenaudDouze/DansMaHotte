import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

// A11Y-02 : chaque page et chaque état qui change le DOM passent par axe-core,
// dans les deux thèmes (A11Y-05). Le thème suit `prefers-color-scheme` tant
// qu'aucun choix n'est enregistré.
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

async function violations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  return results.violations;
}

async function creerListe(page: Page) {
  await page.goto("/");
  await page.fill("#create-name", "Cadeaux de Noël");
  await page.click("#create-form button[type=submit]");
  await page.waitForURL(/\/l\//);
  await expect(page.locator(".conn-dot")).toHaveClass(/online/, { timeout: 10_000 });
}

for (const scheme of ["light", "dark"] as const) {
  test.describe(`thème ${scheme}`, () => {
    test.use({ colorScheme: scheme });

    test("axe : accueil", async ({ page }) => {
      await page.goto("/");
      await expect(page.locator(".home-header h1")).toBeVisible();
      expect(await violations(page)).toEqual([]);
    });

    test("axe : liste avec des cadeaux", async ({ page }) => {
      await creerListe(page);
      await page.fill("#add-input", "Lego");
      await page.click(".add-submit");
      await expect(page.locator(".item .item-name")).toHaveText("Lego");
      expect(await violations(page)).toEqual([]);
    });

    test("axe : menu et réglages d'accessibilité ouverts", async ({ page }) => {
      await creerListe(page);
      await page.click("#btn-menu");
      expect(await violations(page)).toEqual([]);
      await page.click('[data-action="accessibility"]');
      await expect(page.locator(".accessibility-modal")).toBeVisible();
      expect(await violations(page)).toEqual([]);
    });
  });
}
