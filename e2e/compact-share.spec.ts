import { test, expect } from "@playwright/test";

test("lien/QR compact : encode un instantané de la liste, sans donner accès à la liste en direct", async ({ page }) => {
  await page.goto("/");
  await page.fill("#create-name", "Cadeaux de Noël");
  await page.click("#create-form button[type=submit]");
  await page.waitForURL(/\/l\//);
  await expect(page.locator(".conn-dot")).toHaveClass(/online/, { timeout: 10_000 });

  await page.click("#btn-menu");
  await page.click('[data-action="manage-recipients"]');
  await page.fill("#new-recipient-name", "Marie");
  await page.click("#new-recipient-form button[type=submit]");
  await page.click(".modal-close");
  await page.selectOption("#add-recipient", { label: "Marie" });
  await page.fill("#add-input", "Écharpe");
  await page.click(".add-submit");
  await expect(page.locator(".item-name", { hasText: "Écharpe" })).toBeVisible();

  // Génère le lien compact depuis la modale de partage habituelle.
  await page.click("#btn-menu");
  await page.click('[data-action="share"]');
  await page.click("#share-compact");
  await expect(page.locator(".share-modal .qr-wrap svg")).toBeVisible();
  const compactUrl = await page.locator(".share-modal .share-link").textContent();
  expect(compactUrl).toBeTruthy();
  expect(compactUrl).toContain("?import=");

  // Ouvrir ce lien (sans connexion à la liste d'origine) propose de créer une
  // toute nouvelle liste à partir de son contenu.
  await page.goto(compactUrl!);
  await expect(page.locator("h2", { hasText: "Lien de partage compact" })).toBeVisible();
  await expect(page.locator(".modal p", { hasText: "1 cadeau(x) et 1 personne(s)" })).toBeVisible();
  await page.click("#pending-import-create");

  await page.waitForURL(/\/l\//);
  await expect(page.locator(".conn-dot")).toHaveClass(/online/, { timeout: 10_000 });
  await expect(page.locator(".item-name", { hasText: "Écharpe" })).toBeVisible();
  const marieSection = page.locator(".recipient-section", { has: page.locator(".person-name", { hasText: "Marie" }) });
  await expect(marieSection).toBeVisible();

  // Un lien compact ré-ouvert plus tard (ex: recréé depuis l'accueil sans
  // suivre le lien) ne doit pas se re-proposer sur une navigation normale.
  await page.goto("/");
  await expect(page.locator("h2", { hasText: "Lien de partage compact" })).toHaveCount(0);
});

test("le prompt de lien compact peut être ignoré sans créer de liste", async ({ page }) => {
  await page.goto("/");
  await page.fill("#create-name", "Cadeaux de Noël");
  await page.click("#create-form button[type=submit]");
  await page.waitForURL(/\/l\//);
  await expect(page.locator(".conn-dot")).toHaveClass(/online/, { timeout: 10_000 });

  await page.fill("#add-input", "Lego");
  await page.click(".add-submit");

  await page.click("#btn-menu");
  await page.click('[data-action="share"]');
  await page.click("#share-compact");
  const compactUrl = await page.locator(".share-modal .share-link").textContent();

  await page.goto(compactUrl!);
  await expect(page.locator("h2", { hasText: "Lien de partage compact" })).toBeVisible();
  await page.click("#pending-import-cancel");
  await expect(page.locator("h2", { hasText: "Lien de partage compact" })).toHaveCount(0);
  await expect(page.locator(".home-header h1")).toBeVisible();
});
