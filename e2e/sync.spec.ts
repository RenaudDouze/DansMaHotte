import { test, expect } from "@playwright/test";

test("deux appareils sur la même liste se synchronisent en temps réel", async ({ browser }) => {
  const ctx1 = await browser.newContext();
  const ctx2 = await browser.newContext();
  const page1 = await ctx1.newPage();
  const page2 = await ctx2.newPage();

  await page1.goto("/");
  await page1.click("#create-form button[type=submit]");
  await page1.waitForURL(/\/l\//);
  const code = page1.url().split("/l/")[1];
  await expect(page1.locator(".conn-dot")).toHaveClass(/online/, { timeout: 10_000 });

  await page2.goto(`/l/${code}`);
  await expect(page2.locator(".conn-dot")).toHaveClass(/online/, { timeout: 10_000 });

  await page1.fill("#add-input", "Peluches");
  await page1.click(".add-submit");

  await expect(page2.locator(".item .item-name")).toHaveText("Peluches", { timeout: 5000 });

  await page1.click("#list-title");
  await page1.fill(".list-title .inline-edit", "Cadeaux renommés");
  await page1.keyboard.press("Enter");
  await expect(page2.locator("#list-title")).toHaveText("Cadeaux renommés", { timeout: 5000 });

  await ctx1.close();
  await ctx2.close();
});

test("le nombre de personnes connectées se met à jour en temps réel", async ({ browser }) => {
  const ctx1 = await browser.newContext();
  const ctx2 = await browser.newContext();
  const page1 = await ctx1.newPage();
  const page2 = await ctx2.newPage();

  await page1.goto("/");
  await page1.click("#create-form button[type=submit]");
  await page1.waitForURL(/\/l\//);
  const code = page1.url().split("/l/")[1];
  await expect(page1.locator(".conn-dot")).toHaveClass(/online/, { timeout: 10_000 });
  await expect(page1.locator("#presence-count")).toHaveText("1");

  await page2.goto(`/l/${code}`);
  await expect(page2.locator(".conn-dot")).toHaveClass(/online/, { timeout: 10_000 });

  await expect(page1.locator("#presence-count")).toHaveText("2", { timeout: 5000 });
  await expect(page2.locator("#presence-count")).toHaveText("2");

  await page1.click("#btn-presence");
  await expect(page1.locator(".presence-list li")).toHaveCount(2);
  // Deux noms générés indépendamment (contextes isolés) : l'un des deux doit
  // toujours être "Toi" du point de vue de page1.
  await expect(page1.locator(".presence-list li", { hasText: "Toi" })).toHaveCount(1);

  await ctx2.close();
  await expect(page1.locator("#presence-count")).toHaveText("1", { timeout: 5000 });

  await ctx1.close();
});

test("un cadeau en cours de saisie n'est pas effacé par une mise à jour reçue en direct (régression)", async ({ browser }) => {
  // Verrouille le comportement suivant : le rendu déclenché par un message
  // WebSocket entrant ne doit reconstruire que les données (liste de
  // cadeaux, sélecteur de personnes...), jamais le champ de saisie — sinon
  // un texte en cours de frappe est perdu dès qu'un autre appareil modifie
  // la liste au même moment.
  const ctx1 = await browser.newContext();
  const ctx2 = await browser.newContext();
  const page1 = await ctx1.newPage();
  const page2 = await ctx2.newPage();

  await page1.goto("/");
  await page1.click("#create-form button[type=submit]");
  await page1.waitForURL(/\/l\//);
  const code = page1.url().split("/l/")[1];
  await expect(page1.locator(".conn-dot")).toHaveClass(/online/, { timeout: 10_000 });

  await page2.goto(`/l/${code}`);
  await expect(page2.locator(".conn-dot")).toHaveClass(/online/, { timeout: 10_000 });

  // page1 commence à taper mais n'envoie pas encore.
  await page1.fill("#add-input", "Chocolat");

  // page2 déclenche une diffusion d'état pendant que page1 est en train de taper.
  await page2.fill("#add-input", "Bananes");
  await page2.click(".add-submit");
  await expect(page1.locator(".item .item-name", { hasText: "Bananes" })).toBeVisible({ timeout: 5000 });

  // Le texte tapé sur page1 doit avoir survécu à la mise à jour reçue.
  await expect(page1.locator("#add-input")).toHaveValue("Chocolat");

  await page1.click(".add-submit");
  await expect(page1.locator(".item .item-name", { hasText: "Chocolat" })).toBeVisible();

  await ctx1.close();
  await ctx2.close();
});
