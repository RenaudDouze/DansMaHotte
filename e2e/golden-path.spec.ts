import { test, expect } from "@playwright/test";

test("parcours complet : créer, ajouter avec quantité, assigner une personne, changer le statut, partager, exporter/importer", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".home-header h1")).toHaveText("DansMaHotte");

  // Création d'une liste
  await page.fill("#create-name", "Cadeaux de Noël");
  await page.click("#create-form button[type=submit]");
  await page.waitForURL(/\/l\//);
  await expect(page.locator(".conn-dot")).toHaveClass(/online/, { timeout: 10_000 });

  // Ajout avec extraction de quantité, prévisualisée avant même l'envoi
  await page.fill("#add-input", "2x Lego");
  await expect(page.locator("#add-preview-qty")).toHaveText("x2");
  await page.click(".add-submit");
  await expect(page.locator(".item .item-name")).toHaveText("Lego");
  await expect(page.locator(".item .qty-badge")).toHaveText("x2");

  // Un cadeau sans quantité détectée affiche le badge "+" (à éditer au besoin)
  await page.fill("#add-input", "Livre");
  await page.click(".add-submit");
  await expect(page.locator(".item")).toHaveCount(2);

  // Personnes : création, puis assignation via le sélecteur du formulaire.
  await page.click("#btn-menu");
  await page.click('[data-action="manage-recipients"]');
  await page.fill("#new-recipient-name", "Marie");
  await page.click("#new-recipient-form button[type=submit]");
  await page.click(".modal-close");
  await page.selectOption("#add-recipient", { label: "Marie" });
  await page.fill("#add-input", "Écharpe");
  await page.click(".add-submit");

  const marieSection = page.locator(".recipient-section", { has: page.locator(".person-name", { hasText: "Marie" }) });
  await expect(marieSection.locator(".item-name")).toHaveText(["Écharpe"]);

  // Passer un cadeau au statut "Emballé" le fait basculer visuellement
  const livre = page.locator(".item", { has: page.locator(".item-name", { hasText: "Livre" }) });
  await livre.locator(".item-status").click();
  await page.locator(".status-picker .status-pill", { hasText: "Emballé" }).click();
  await expect(page.locator(".item.checked .item-name", { hasText: "Livre" })).toBeVisible();

  // Partage : code affiché + QR code généré, export/import accessibles
  // depuis la même modale (menu ⋮ → Partager).
  await page.click("#btn-menu");
  await page.click('[data-action="share"]');
  await expect(page.locator(".share-modal .share-code")).not.toBeEmpty();
  await expect(page.locator(".share-modal .qr-wrap svg")).toBeVisible();

  // Export puis import (fusion) dans une nouvelle liste
  const [download] = await Promise.all([page.waitForEvent("download"), page.click("#share-export")]);
  const exportPath = await download.path();
  expect(exportPath).toBeTruthy();

  await page.goto("/");
  await page.click("#create-form button[type=submit]");
  await page.waitForURL(/\/l\//);
  await expect(page.locator(".conn-dot")).toHaveClass(/online/, { timeout: 10_000 });
  await page.click("#btn-menu");
  await page.click('[data-action="share"]');
  await page.click("#share-import");
  await page.setInputFiles("#share-import-file", exportPath!);
  await page.click("#import-merge");
  await expect(page.locator(".item-name", { hasText: "Lego" })).toBeVisible();
  await expect(page.locator(".item-name", { hasText: "Écharpe" })).toBeVisible();
});

test("un code inconnu affiche un message clair plutôt qu'un écran vide", async ({ page }) => {
  await page.goto("/l/ZZZZZZ");
  await expect(page.locator(".centered-message")).toContainText("Aucune liste ne correspond au code");
});
