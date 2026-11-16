import { expect, test } from "@playwright/test";

// Projet « offline » (playwright.config.ts) : il sert le build de production,
// seul à enregistrer un service worker. Après un premier chargement, l'accueil
// doit se recharger sans réseau et annoncer qu'on est hors ligne.
test("l'accueil se recharge hors ligne et annonce l'absence de réseau", async ({ page, context }) => {
  await page.goto("/");
  await page.evaluate(() => navigator.serviceWorker.ready);
  // Avec registerType « prompt », le service worker ne prend le contrôle de la
  // page qu'au chargement suivant.
  await page.reload();
  await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true);
  await expect(page.locator("#offline-banner")).toBeHidden();

  await context.setOffline(true);
  await page.reload();

  await expect(page.locator("#app")).not.toBeEmpty();
  await expect(page.locator("#offline-banner")).toBeVisible();
  await expect(page.locator("#offline-banner")).toContainText("Hors ligne");
});
