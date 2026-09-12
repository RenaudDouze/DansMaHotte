import { test, expect, type Locator } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

// Pas de case à cocher dans une liste de cadeaux : le statut "Emballé" en
// tient lieu (voir worker/reducer.ts, qui dérive `checked` du statut). Ce
// helper choisit un statut sur un cadeau donné, comme le ferait un clic
// utilisateur sur son badge puis sur une pastille du menu.
async function setStatus(item: Locator, label: string): Promise<void> {
  await item.locator(".item-status").click();
  await item.page().locator(".status-picker .status-pill", { hasText: label }).click();
}
const markAsWrapped = (item: Locator) => setStatus(item, "Emballé");

// Une image PNG 1x1 minimale, utilisée par le test de photo ci-dessous.
test.beforeAll(() => {
  const dir = path.join(process.cwd(), "e2e", "fixtures");
  mkdirSync(dir, { recursive: true });
  const pngBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
  writeFileSync(path.join(dir, "pixel.png"), Buffer.from(pngBase64, "base64"));
});

test("le thème choisi persiste après un rechargement", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("html")).not.toHaveAttribute("data-theme", /.+/);

  await page.click("#theme-toggle");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");

  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");

  await page.click("#theme-toggle");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
});

test("les réglages d'accessibilité s'appliquent immédiatement et persistent après un rechargement", async ({ page }) => {
  await page.goto("/");
  await page.click("#btn-accessibility");
  await expect(page.locator(".accessibility-modal")).toBeVisible();
  await expect(page.locator("html")).not.toHaveAttribute("data-large-text", /.*/);
  await expect(page.locator("html")).not.toHaveAttribute("data-high-contrast", /.*/);
  await expect(page.locator("html")).not.toHaveAttribute("data-reduce-motion", /.*/);

  await page.locator('input[data-key="largeText"]').check();
  await expect(page.locator("html")).toHaveAttribute("data-large-text", "");
  await page.locator('input[data-key="highContrast"]').check();
  await expect(page.locator("html")).toHaveAttribute("data-high-contrast", "");
  await page.locator('input[data-key="reduceMotion"]').check();
  await expect(page.locator("html")).toHaveAttribute("data-reduce-motion", "");

  await page.click(".modal-close");
  await expect(page.locator(".accessibility-modal")).toHaveCount(0);

  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-large-text", "");
  await expect(page.locator("html")).toHaveAttribute("data-high-contrast", "");
  await expect(page.locator("html")).toHaveAttribute("data-reduce-motion", "");

  // Décocher retire l'attribut, et la préférence reste accessible depuis une
  // liste (même réglage, pas seulement depuis l'accueil).
  await page.click("#create-form button[type=submit]");
  await page.waitForURL(/\/l\//);
  await expect(page.locator(".conn-dot")).toHaveClass(/online/, { timeout: 10_000 });
  await page.click("#btn-menu");
  await page.click('[data-action="accessibility"]');
  await expect(page.locator('input[data-key="largeText"]')).toBeChecked();
  await page.locator('input[data-key="largeText"]').uncheck();
  await expect(page.locator("html")).not.toHaveAttribute("data-large-text", /.*/);
});

test("supprimer un cadeau demande un second clic au même endroit, puis reste annulable", async ({ page }) => {
  await page.goto("/");
  await page.click("#create-form button[type=submit]");
  await page.waitForURL(/\/l\//);
  await expect(page.locator(".conn-dot")).toHaveClass(/online/, { timeout: 10_000 });

  await page.fill("#add-input", "Lego");
  await page.click(".add-submit");
  await expect(page.locator(".item .item-name")).toHaveText("Lego");

  // Premier clic : arme le bouton, ne supprime rien encore.
  await page.click(".item-delete");
  await expect(page.locator(".item-delete")).toHaveClass(/confirm-armed/);
  await expect(page.locator(".item")).toHaveCount(1);

  // Second clic au même endroit : confirme la suppression.
  await page.click(".item-delete");
  await expect(page.locator(".item")).toHaveCount(0);
  await expect(page.locator("#undo-toast")).toContainText("« Lego » supprimé");

  await page.click("#undo-toast button");
  await expect(page.locator(".item .item-name")).toHaveText("Lego");
});

test("la recherche filtre les cadeaux et se referme proprement", async ({ page }) => {
  await page.goto("/");
  await page.click("#create-form button[type=submit]");
  await page.waitForURL(/\/l\//);
  await expect(page.locator(".conn-dot")).toHaveClass(/online/, { timeout: 10_000 });

  for (const name of ["Lego", "Livre", "Écharpe"]) {
    await page.fill("#add-input", name);
    await page.click(".add-submit");
  }
  await expect(page.locator(".item")).toHaveCount(3);

  await page.click("#btn-search");
  await page.fill("#search-input", "l");
  await expect(page.locator(".item-name")).toHaveText(["Lego", "Livre"]);

  await page.fill("#search-input", "introuvable");
  await expect(page.locator(".empty-state")).toContainText("Aucun cadeau ne correspond");

  await page.click("#search-close");
  await expect(page.locator(".item")).toHaveCount(3);
  await expect(page.locator("#search-bar")).toBeHidden();
});

test("emballer le dernier cadeau déclenche une célébration, mais pas au rechargement d'une liste déjà terminée", async ({ page }) => {
  await page.goto("/");
  await page.click("#create-form button[type=submit]");
  await page.waitForURL(/\/l\//);
  await expect(page.locator(".conn-dot")).toHaveClass(/online/, { timeout: 10_000 });

  await page.fill("#add-input", "Lego");
  await page.click(".add-submit");
  await expect(page.locator(".item")).toHaveCount(1);

  await markAsWrapped(page.locator(".item"));
  await expect(page.locator(".celebration-toast")).toBeVisible();

  await page.reload();
  await expect(page.locator(".conn-dot")).toHaveClass(/online/, { timeout: 10_000 });
  await page.waitForTimeout(1000);
  await expect(page.locator(".celebration-toast")).toHaveCount(0);
});

test("les listes favorites sont épinglées au-dessus des autres, sans code affiché", async ({ page }) => {
  await page.goto("/");
  await page.fill("#create-name", "Liste A");
  await page.click("#create-form button[type=submit]");
  await page.waitForURL(/\/l\//);
  await page.click("#btn-home");

  await page.fill("#create-name", "Liste B");
  await page.click("#create-form button[type=submit]");
  await page.waitForURL(/\/l\//);
  await page.click("#btn-home");

  await expect(page.locator(".recent-item")).toHaveCount(2);
  await expect(page.locator(".recent-code")).toHaveCount(0);
  await expect(page.locator(".recent-name").first()).toHaveText("Liste B");

  await page.locator(".recent-item", { hasText: "Liste A" }).locator(".recent-favorite").click();

  await expect(page.locator(".recent-subheading").first()).toHaveText("Favoris");
  await expect(page.locator(".recent-subheading").nth(1)).toHaveText("Autres");
  await expect(page.locator(".recent-name").first()).toHaveText("Liste A");

  // « Listes récentes » passe avant « Nouvelle liste », elle-même avant
  // « Rejoindre une liste » (l'utilisateur revient plus souvent sur une
  // liste existante qu'il n'en crée ou n'en rejoint une nouvelle).
  await expect(page.locator(".card h2")).toHaveText(["Listes récentes", "Nouvelle liste", "Rejoindre une liste"]);
});

test("une personne sans cadeau reste visible dans la liste (pour ne pas l'oublier), mais disparaît le temps d'une recherche", async ({ page }) => {
  await page.goto("/");
  await page.click("#create-form button[type=submit]");
  await page.waitForURL(/\/l\//);
  await expect(page.locator(".conn-dot")).toHaveClass(/online/, { timeout: 10_000 });

  await page.click("#btn-menu");
  await page.click('[data-action="manage-recipients"]');
  await page.fill("#new-recipient-name", "Marie");
  await page.click("#new-recipient-form button[type=submit]");
  await expect(page.locator(".manage-recipient-list li", { hasText: "Marie" })).toHaveCount(1);
  await page.fill("#new-recipient-name", "Paul");
  await page.click("#new-recipient-form button[type=submit]");
  await expect(page.locator(".manage-recipient-list li", { hasText: "Paul" })).toHaveCount(1);
  await page.keyboard.press("Escape");

  // Un seul cadeau, pour "Marie" : "Paul" (encore vide) doit quand même
  // apparaître, avec un petit texte indiquant qu'il n'a rien pour l'instant.
  await page.selectOption("#add-recipient", { label: "Marie" });
  await page.fill("#add-input", "Lego");
  await page.click(".add-submit");

  await expect(page.locator(".person-name")).toHaveText(["Marie", "Paul"]);
  await expect(page.locator(".recipient-section")).toHaveCount(2);
  const paulSection = page.locator(".recipient-section", { has: page.locator(".person-name", { hasText: "Paul" }) });
  await expect(paulSection.locator(".item")).toHaveCount(0);
  await expect(paulSection.locator(".recipient-empty")).toHaveText("Aucun cadeau pour l'instant");

  // Pendant une recherche, une section vide n'a rien d'utile à montrer.
  await page.click("#btn-search");
  await page.fill("#search-input", "Lego");
  await expect(page.locator(".person-name")).toHaveText(["Marie"]);
  await page.click("#search-close");
  await expect(page.locator(".person-name")).toHaveText(["Marie", "Paul"]);

  // Les deux personnes restent proposables/gérables ailleurs.
  await expect(page.locator("#add-recipient option")).toHaveText(["Sans destinataire", "Marie", "Paul"]);
  await page.click("#btn-menu");
  await page.click('[data-action="manage-recipients"]');
  await expect(page.locator(".recipient-name", { hasText: "Marie" })).toHaveCount(1);
  await expect(page.locator(".recipient-name", { hasText: "Paul" })).toHaveCount(1);
});

test("l'ordre manuel des personnes s'affiche dans la liste mais pas dans le menu déroulant", async ({ page }) => {
  await page.goto("/");
  await page.click("#create-form button[type=submit]");
  await page.waitForURL(/\/l\//);
  await expect(page.locator(".conn-dot")).toHaveClass(/online/, { timeout: 10_000 });

  // Créées dans un ordre volontairement non alphabétique : "Zoé" avant
  // "Abel" fixe l'ordre manuel des personnes (par défaut, l'ordre de création).
  await page.click("#btn-menu");
  await page.click('[data-action="manage-recipients"]');
  await page.fill("#new-recipient-name", "Zoé");
  await page.click("#new-recipient-form button[type=submit]");
  await expect(page.locator(".manage-recipient-list li", { hasText: "Zoé" })).toHaveCount(1);
  await page.fill("#new-recipient-name", "Abel");
  await page.click("#new-recipient-form button[type=submit]");
  await expect(page.locator(".manage-recipient-list li", { hasText: "Abel" })).toHaveCount(1);
  await page.keyboard.press("Escape");

  // Le menu déroulant (ajout de cadeau) reste alphabétique, quel que soit
  // l'ordre manuel des personnes.
  await expect(page.locator("#add-recipient option")).toHaveText(["Sans destinataire", "Abel", "Zoé"]);

  await page.selectOption("#add-recipient", { label: "Zoé" });
  await page.fill("#add-input", "Lion en peluche");
  await page.click(".add-submit");
  await page.selectOption("#add-recipient", { label: "Abel" });
  await page.fill("#add-input", "Ballon");
  await page.click(".add-submit");

  // La liste principale, elle, respecte l'ordre manuel : "Zoé" avant "Abel",
  // pas l'ordre alphabétique.
  await expect(page.locator(".person-name")).toHaveText(["Zoé", "Abel"]);
});

test("on peut réordonner les personnes par glisser-déposer dans le gestionnaire", async ({ page }) => {
  await page.goto("/");
  await page.click("#create-form button[type=submit]");
  await page.waitForURL(/\/l\//);
  await expect(page.locator(".conn-dot")).toHaveClass(/online/, { timeout: 10_000 });

  await page.click("#btn-menu");
  await page.click('[data-action="manage-recipients"]');
  await page.fill("#new-recipient-name", "Zoé");
  await page.click("#new-recipient-form button[type=submit]");
  await expect(page.locator(".manage-recipient-list li", { hasText: "Zoé" })).toHaveCount(1);
  await page.fill("#new-recipient-name", "Abel");
  await page.click("#new-recipient-form button[type=submit]");
  await expect(page.locator(".manage-recipient-list li", { hasText: "Abel" })).toHaveCount(1);

  // Ordre initial : ordre de création (Zoé avant Abel).
  await expect(page.locator(".manage-recipient-list .recipient-name")).toHaveText(["Zoé", "Abel"]);

  const zoeRow = page.locator(".manage-recipient-list li", { hasText: "Zoé" });
  const abelHandle = page.locator(".manage-recipient-list li", { hasText: "Abel" }).locator(".recipient-manage-drag-handle");
  const zoeBox = await zoeRow.boundingBox();
  const handleBox = await abelHandle.boundingBox();
  if (!zoeBox || !handleBox) throw new Error("lignes introuvables");
  const startX = handleBox.x + handleBox.width / 2;
  const startY = handleBox.y + handleBox.height / 2;
  const targetX = zoeBox.x + zoeBox.width / 2;
  const targetY = zoeBox.y + 4; // moitié haute de la ligne "Zoé" : insertion avant elle

  await abelHandle.dispatchEvent("pointerdown", { pointerType: "mouse", pointerId: 1, clientX: startX, clientY: startY, bubbles: true });
  await abelHandle.dispatchEvent("pointermove", {
    pointerType: "mouse",
    pointerId: 1,
    clientX: targetX,
    clientY: targetY,
    bubbles: true,
    cancelable: true,
  });
  await abelHandle.dispatchEvent("pointerup", { pointerType: "mouse", pointerId: 1, clientX: targetX, clientY: targetY, bubbles: true });

  // Glisser "Abel" au-dessus de "Zoé" inverse l'ordre manuel, et c'est
  // envoyé au serveur (reorderRecipients), pas juste un effet visuel local.
  await expect(page.locator(".manage-recipient-list .recipient-name")).toHaveText(["Abel", "Zoé"]);
  await page.keyboard.press("Escape");
  await page.click("#btn-menu");
  await page.click('[data-action="manage-recipients"]');
  await expect(page.locator(".manage-recipient-list .recipient-name")).toHaveText(["Abel", "Zoé"]);
  await page.keyboard.press("Escape");

  // ... et se répercute sur l'ordre affiché dans la liste de cadeaux.
  await page.selectOption("#add-recipient", { label: "Zoé" });
  await page.fill("#add-input", "Lion en peluche");
  await page.click(".add-submit");
  await page.selectOption("#add-recipient", { label: "Abel" });
  await page.fill("#add-input", "Ballon");
  await page.click(".add-submit");
  await expect(page.locator(".person-name")).toHaveText(["Abel", "Zoé"]);
});

test("une personne dont tous les cadeaux sont emballés passe après les autres", async ({ page }) => {
  await page.goto("/");
  await page.click("#create-form button[type=submit]");
  await page.waitForURL(/\/l\//);
  await expect(page.locator(".conn-dot")).toHaveClass(/online/, { timeout: 10_000 });

  await page.click("#btn-menu");
  await page.click('[data-action="manage-recipients"]');
  await page.fill("#new-recipient-name", "Marie");
  await page.click("#new-recipient-form button[type=submit]");
  await expect(page.locator(".manage-recipient-list li", { hasText: "Marie" })).toHaveCount(1);
  await page.fill("#new-recipient-name", "Paul");
  await page.click("#new-recipient-form button[type=submit]");
  await expect(page.locator(".manage-recipient-list li", { hasText: "Paul" })).toHaveCount(1);
  await page.keyboard.press("Escape");

  await page.selectOption("#add-recipient", { label: "Marie" });
  await page.fill("#add-input", "Écharpe");
  await page.click(".add-submit");
  await page.selectOption("#add-recipient", { label: "Paul" });
  await page.fill("#add-input", "Stylo");
  await page.click(".add-submit");

  await expect(page.locator(".person-name")).toHaveText(["Marie", "Paul"]);
  // Attend que les deux ajouts soient bien confirmés par le serveur avant
  // d'ouvrir un popover : sinon un état encore en vol peut arriver pendant
  // l'interaction et refermer le popover fraîchement ouvert sous nos pieds.
  await expect(page.locator(".item")).toHaveCount(2);

  // Emballer le seul cadeau de "Marie" la fait passer après "Paul", encore
  // incomplet.
  const echarpe = page.locator(".item", { has: page.locator(".item-name", { hasText: "Écharpe" }) });
  await markAsWrapped(echarpe);
  await expect(page.locator(".person-name")).toHaveText(["Paul", "Marie"]);

  // Recharger confirme que l'écho serveur du changement précédent est bien
  // arrivé, avant de rouvrir un popover sur ce même cadeau (sinon cet écho
  // encore en vol peut arriver pendant l'interaction et refermer le popover
  // fraîchement ouvert sous nos pieds) — et vérifie au passage la persistance.
  await page.reload();
  await expect(page.locator(".conn-dot")).toHaveClass(/online/, { timeout: 10_000 });
  await expect(page.locator(".person-name")).toHaveText(["Paul", "Marie"]);

  // Changer à nouveau son statut restaure l'ordre d'origine.
  await setStatus(page.locator(".item", { has: page.locator(".item-name", { hasText: "Écharpe" }) }), "Idée");
  await expect(page.locator(".person-name")).toHaveText(["Marie", "Paul"]);
});

test("le statut d'un cadeau se choisit dans un petit menu, sans changer l'ordre des cadeaux ni des personnes", async ({ page }) => {
  await page.goto("/");
  await page.click("#create-form button[type=submit]");
  await page.waitForURL(/\/l\//);
  await expect(page.locator(".conn-dot")).toHaveClass(/online/, { timeout: 10_000 });

  await page.click("#btn-menu");
  await page.click('[data-action="manage-recipients"]');
  await page.fill("#new-recipient-name", "Marie");
  await page.click("#new-recipient-form button[type=submit]");
  await expect(page.locator(".manage-recipient-list li", { hasText: "Marie" })).toHaveCount(1);
  await page.fill("#new-recipient-name", "Paul");
  await page.click("#new-recipient-form button[type=submit]");
  await expect(page.locator(".manage-recipient-list li", { hasText: "Paul" })).toHaveCount(1);
  await page.keyboard.press("Escape");

  await page.selectOption("#add-recipient", { label: "Marie" });
  for (const name of ["Écharpe", "Lego", "Livre"]) {
    await page.fill("#add-input", name);
    await page.click(".add-submit");
  }
  await page.selectOption("#add-recipient", { label: "Paul" });
  await page.fill("#add-input", "Stylo");
  await page.click(".add-submit");

  // Par défaut, tous les cadeaux sont au statut "Idée".
  await expect(page.locator(".person-name")).toHaveText(["Marie", "Paul"]);
  await expect(page.locator(".item-name")).toHaveText(["Écharpe", "Lego", "Livre", "Stylo"]);
  const livreItem = page.locator(".item", { has: page.locator(".item-name", { hasText: "Livre" }) });
  const livreStatus = livreItem.locator(".item-status");
  await expect(livreStatus).toHaveText("Idée");

  // Cliquer le badge ouvre un menu listant les 6 statuts ; en choisir un le
  // referme et l'applique : ni le cadeau ni sa personne ne bougent, seule
  // son apparence change.
  await livreStatus.click();
  const picker = page.locator(".status-picker");
  await expect(picker.locator(".status-pill")).toHaveText(["Idée", "Acheté", "Commandé", "Reçu", "À plusieurs", "Emballé"]);
  await expect(picker.locator('.status-pill[aria-pressed="true"]')).toHaveText("Idée");
  await picker.locator(".status-pill", { hasText: "Commandé" }).click();
  await expect(picker).toHaveCount(0);
  await expect(livreStatus).toHaveText("Commandé");
  await expect(page.locator(".item-name")).toHaveText(["Écharpe", "Lego", "Livre", "Stylo"]);
  await expect(page.locator(".person-name")).toHaveText(["Marie", "Paul"]);

  // Persiste après rechargement (aller-retour serveur, pas juste local).
  await page.reload();
  await expect(page.locator(".conn-dot")).toHaveClass(/online/, { timeout: 10_000 });
  await expect(livreStatus).toHaveText("Commandé");
});

test("changer le statut s'affiche immédiatement, sans attendre la confirmation serveur", async ({ page }) => {
  // Retarde artificiellement tous les messages entrants (serveur -> page) le
  // temps du test, mais laisse circuler ceux sortants (page -> serveur)
  // sans délai : si le badge de statut n'apparaissait qu'après l'aller-
  // retour serveur (comme avant la mise à jour optimiste), l'assertion au
  // timeout court ci-dessous échouerait.
  await page.routeWebSocket(
    (url) => url.pathname.endsWith("/ws"),
    (ws) => {
      const server = ws.connectToServer();
      server.onMessage((message) => {
        setTimeout(() => ws.send(message), 1500);
      });
    },
  );

  await page.goto("/");
  await page.click("#create-form button[type=submit]");
  await page.waitForURL(/\/l\//);
  await expect(page.locator(".conn-dot")).toHaveClass(/online/, { timeout: 10_000 });

  await page.fill("#add-input", "Lego");
  await page.click(".add-submit");
  await expect(page.locator(".item")).toHaveCount(1, { timeout: 10_000 });

  const statusBtn = page.locator(".item-status");
  await expect(statusBtn).toHaveText("Idée");
  await statusBtn.click();
  await page.locator(".status-picker .status-pill", { hasText: "Acheté" }).click();
  await expect(statusBtn).toHaveText("Acheté", { timeout: 400 });
});

test("cliquer le badge de statut referme le menu s'il était déjà ouvert, et cliquer ailleurs le referme aussi", async ({ page }) => {
  await page.goto("/");
  await page.click("#create-form button[type=submit]");
  await page.waitForURL(/\/l\//);
  await expect(page.locator(".conn-dot")).toHaveClass(/online/, { timeout: 10_000 });

  await page.fill("#add-input", "Lego");
  await page.click(".add-submit");
  await expect(page.locator(".item")).toHaveCount(1);

  const statusBtn = page.locator(".item-status");
  await statusBtn.click();
  await expect(page.locator(".status-picker")).toHaveCount(1);
  await statusBtn.click();
  await expect(page.locator(".status-picker")).toHaveCount(0);

  await statusBtn.click();
  await expect(page.locator(".status-picker")).toHaveCount(1);
  await page.locator(".list-privacy-note").click();
  await expect(page.locator(".status-picker")).toHaveCount(0);
});

test("on peut ajouter, modifier et retirer le lien d'un cadeau", async ({ page }) => {
  await page.goto("/");
  await page.click("#create-form button[type=submit]");
  await page.waitForURL(/\/l\//);
  await expect(page.locator(".conn-dot")).toHaveClass(/online/, { timeout: 10_000 });

  await page.fill("#add-input", "Lego");
  await page.click(".add-submit");
  await expect(page.locator(".item")).toHaveCount(1);

  const linkBtn = page.locator(".item-link");
  await expect(linkBtn).toHaveClass(/item-link-empty/);

  // Saisir un lien sans schéma explicite : normalisé en https:// côté
  // serveur (voir worker/reducer.ts normalizeLink).
  await linkBtn.click();
  const editor = page.locator(".link-editor");
  await expect(editor.locator(".link-editor-open")).toHaveCount(0);
  await editor.locator(".link-editor-input").fill("exemple.fr/lego");
  await editor.locator("button[type=submit]").click();
  await expect(editor).toHaveCount(0);
  await expect(linkBtn).toHaveClass(/item-link-set/);

  // Persiste après rechargement (aller-retour serveur, pas juste local).
  await page.reload();
  await expect(page.locator(".conn-dot")).toHaveClass(/online/, { timeout: 10_000 });
  await expect(page.locator(".item-link")).toHaveClass(/item-link-set/);

  // Rouvrir affiche d'abord le lien en lecture seule (avec un raccourci pour
  // l'ouvrir), pas directement le champ d'édition.
  await page.locator(".item-link").click();
  const reopened = page.locator(".link-editor");
  await expect(reopened.locator(".link-editor-open")).toHaveAttribute("href", "https://exemple.fr/lego");
  await expect(reopened.locator(".link-editor-input")).toHaveCount(0);

  // L'icône crayon bascule vers le champ d'édition, pré-rempli.
  await reopened.locator(".link-editor-edit").click();
  await expect(reopened.locator(".link-editor-input")).toHaveValue("https://exemple.fr/lego");

  // Le retirer repasse le bouton en état "vide".
  await reopened.locator(".link-editor-remove").click();
  await expect(reopened).toHaveCount(0);
  await expect(page.locator(".item-link")).toHaveClass(/item-link-empty/);
});

test("cliquer le bouton de lien referme le popover s'il était déjà ouvert, et cliquer ailleurs le referme aussi", async ({ page }) => {
  await page.goto("/");
  await page.click("#create-form button[type=submit]");
  await page.waitForURL(/\/l\//);
  await expect(page.locator(".conn-dot")).toHaveClass(/online/, { timeout: 10_000 });

  await page.fill("#add-input", "Lego");
  await page.click(".add-submit");
  await expect(page.locator(".item")).toHaveCount(1);

  const linkBtn = page.locator(".item-link");
  await linkBtn.click();
  await expect(page.locator(".link-editor")).toHaveCount(1);
  await linkBtn.click();
  await expect(page.locator(".link-editor")).toHaveCount(0);

  await linkBtn.click();
  await expect(page.locator(".link-editor")).toHaveCount(1);
  await page.locator(".list-privacy-note").click();
  await expect(page.locator(".link-editor")).toHaveCount(0);
});

test("on peut ajouter, modifier et effacer le prix d'un cadeau, avec les totaux qui suivent", async ({ page }) => {
  await page.goto("/");
  await page.click("#create-form button[type=submit]");
  await page.waitForURL(/\/l\//);
  await expect(page.locator(".conn-dot")).toHaveClass(/online/, { timeout: 10_000 });

  await page.fill("#add-input", "Lego");
  await page.click(".add-submit");
  await page.fill("#add-input", "Livre");
  await page.click(".add-submit");
  await expect(page.locator(".item")).toHaveCount(2);

  const lego = page.locator(".item", { has: page.locator(".item-name", { hasText: "Lego" }) });
  const livre = page.locator(".item", { has: page.locator(".item-name", { hasText: "Livre" }) });
  await expect(lego.locator(".item-price")).toHaveClass(/item-price-empty/);
  await expect(lego.locator(".item-price")).toHaveText("€");
  await expect(page.locator(".totals-bar")).toBeHidden();

  // Saisie avec une virgule décimale (usage français courant), arrondie au
  // centime par le serveur.
  await lego.locator(".item-price").click();
  await page.fill(".item-price .inline-edit", "19,999");
  await page.keyboard.press("Enter");
  await expect(lego.locator(".item-price")).toHaveText("20,00 €");
  await expect(lego.locator(".item-price")).not.toHaveClass(/item-price-empty/);
  await expect(page.locator(".totals-bar")).toHaveText("Total : 20,00 €");

  // Un second prix s'additionne au total.
  await livre.locator(".item-price").click();
  await page.fill(".item-price .inline-edit", "10");
  await page.keyboard.press("Enter");
  await expect(page.locator(".totals-bar")).toHaveText("Total : 30,00 €");

  // Persiste après rechargement (aller-retour serveur, pas juste local).
  await page.reload();
  await expect(page.locator(".conn-dot")).toHaveClass(/online/, { timeout: 10_000 });
  await expect(page.locator(".totals-bar")).toHaveText("Total : 30,00 €");

  // Une saisie invalide est rejetée (toast) et n'altère pas le prix existant.
  await page.locator(".item", { has: page.locator(".item-name", { hasText: "Lego" }) })
    .locator(".item-price")
    .click();
  await page.fill(".item-price .inline-edit", "abc");
  await page.keyboard.press("Enter");
  await expect(page.locator(".toast")).toContainText("Prix invalide");
  await expect(page.locator(".totals-bar")).toHaveText("Total : 30,00 €");

  // Vider le champ efface le prix.
  await page.locator(".item", { has: page.locator(".item-name", { hasText: "Lego" }) })
    .locator(".item-price")
    .click();
  await page.fill(".item-price .inline-edit", "");
  await page.keyboard.press("Enter");
  await expect(page.locator(".item", { has: page.locator(".item-name", { hasText: "Lego" }) }).locator(".item-price")).toHaveText("€");
  await expect(page.locator(".totals-bar")).toHaveText("Total : 10,00 €");
});

test("le total par destinataire n'apparaît que si l'un de ses cadeaux a un prix, et s'additionne au total général", async ({ page }) => {
  await page.goto("/");
  await page.click("#create-form button[type=submit]");
  await page.waitForURL(/\/l\//);
  await expect(page.locator(".conn-dot")).toHaveClass(/online/, { timeout: 10_000 });

  await page.click("#btn-menu");
  await page.click('[data-action="manage-recipients"]');
  await page.fill("#new-recipient-name", "Marie");
  await page.click("#new-recipient-form button[type=submit]");
  await expect(page.locator(".manage-recipient-list li", { hasText: "Marie" })).toHaveCount(1);
  await page.fill("#new-recipient-name", "Paul");
  await page.click("#new-recipient-form button[type=submit]");
  await expect(page.locator(".manage-recipient-list li", { hasText: "Paul" })).toHaveCount(1);
  await page.keyboard.press("Escape");

  await page.selectOption("#add-recipient", { label: "Marie" });
  await page.fill("#add-input", "Écharpe");
  await page.click(".add-submit");
  await page.selectOption("#add-recipient", { label: "Paul" });
  await page.fill("#add-input", "Stylo");
  await page.click(".add-submit");
  await expect(page.locator(".item")).toHaveCount(2);

  const marieSection = page.locator(".recipient-section", { has: page.locator(".person-name", { hasText: "Marie" }) });
  const paulSection = page.locator(".recipient-section", { has: page.locator(".person-name", { hasText: "Paul" }) });
  await expect(marieSection.locator(".recipient-total")).toHaveCount(0);
  await expect(paulSection.locator(".recipient-total")).toHaveCount(0);

  await marieSection.locator(".item-price").click();
  await page.fill(".item-price .inline-edit", "25");
  await page.keyboard.press("Enter");
  await expect(marieSection.locator(".recipient-total")).toHaveText("25,00 €");
  await expect(paulSection.locator(".recipient-total")).toHaveCount(0);
  await expect(page.locator(".totals-bar")).toHaveText("Total : 25,00 €");
});

test("on peut choisir manuellement la couleur d'une personne, puis revenir à l'automatique", async ({ page }) => {
  await page.goto("/");
  await page.click("#create-form button[type=submit]");
  await page.waitForURL(/\/l\//);
  await expect(page.locator(".conn-dot")).toHaveClass(/online/, { timeout: 10_000 });

  await page.click("#btn-menu");
  await page.click('[data-action="manage-recipients"]');
  await page.fill("#new-recipient-name", "Marie");
  await page.click("#new-recipient-form button[type=submit]");
  const row = page.locator(".manage-recipient-list li", { hasText: "Marie" });
  await row.waitFor();
  const autoHue = await row.locator(".recipient-row").evaluate((el) => getComputedStyle(el).getPropertyValue("--person-hue").trim());

  // La palette est fermée par défaut ; cliquer sur le point ouvre le choix,
  // avec "Auto" déjà marqué comme sélectionné.
  await expect(row.locator(".color-palette")).toHaveCount(0);
  await row.locator(".color-swatch-toggle").click();
  await expect(row.locator(".color-swatch-auto")).toHaveClass(/selected/);

  // Choisir "Bleu" (teinte 240) applique la couleur, ferme la palette, et se
  // reflète aussi dans la liste principale (cadeau de cette personne).
  await row.locator('.color-swatch[data-color="240"]').click();
  await expect(row.locator(".color-palette")).toHaveCount(0);
  await expect(row.locator(".recipient-row")).toHaveCSS("--person-hue", "240");
  await page.keyboard.press("Escape");

  await page.selectOption("#add-recipient", { label: "Marie" });
  await page.fill("#add-input", "Écharpe");
  await page.click(".add-submit");
  await expect(page.locator(".recipient-section.has-color")).toHaveCSS("--person-hue", "240");

  // Revenir à "Auto" retire la couleur manuelle.
  await page.click("#btn-menu");
  await page.click('[data-action="manage-recipients"]');
  await row.locator(".color-swatch-toggle").click();
  await row.locator(".color-swatch-auto").click();
  await expect(row.locator(".recipient-row")).toHaveCSS("--person-hue", autoHue);
});

test("« Vider les cadeaux emballés » demande aussi un second clic au même endroit", async ({ page }) => {
  await page.goto("/");
  await page.click("#create-form button[type=submit]");
  await page.waitForURL(/\/l\//);
  await expect(page.locator(".conn-dot")).toHaveClass(/online/, { timeout: 10_000 });

  await page.fill("#add-input", "Lego");
  await page.click(".add-submit");
  await markAsWrapped(page.locator(".item"));

  const clearBtn = page.locator('[data-action="clear-checked"]');

  // Premier clic : arme le bouton (texte de confirmation), ne vide rien.
  await page.click("#btn-menu");
  await clearBtn.click();
  await expect(clearBtn).toHaveText("Confirmer : tout vider ?");
  await expect(page.locator(".item")).toHaveCount(1);

  // Second clic au même endroit : confirme, et referme le menu.
  await clearBtn.click();
  await expect(page.locator(".item")).toHaveCount(0);
  await expect(page.locator("#menu-panel")).toBeHidden();
  await expect(page.locator("#undo-toast")).toContainText("1 cadeau(x) emballé(s) vidé(s)");

  await page.click("#undo-toast button");
  await expect(page.locator(".item .item-name")).toHaveText("Lego");
});

test("le tri alphabétique des cadeaux est optionnel et persiste après un rechargement", async ({ page }) => {
  await page.goto("/");
  await page.click("#create-form button[type=submit]");
  await page.waitForURL(/\/l\//);
  await expect(page.locator(".conn-dot")).toHaveClass(/online/, { timeout: 10_000 });

  for (const name of ["Yaourts", "Bananes", "Chocolat"]) {
    await page.fill("#add-input", name);
    await page.click(".add-submit");
  }
  // Par défaut (tri manuel) : ordre d'ajout.
  await expect(page.locator(".item-name")).toHaveText(["Yaourts", "Bananes", "Chocolat"]);

  await page.click("#btn-menu");
  const sortBtn = page.locator('[data-action="item-sort"]');
  await expect(sortBtn).toHaveText("Tri des cadeaux : Manuel");
  await sortBtn.click();
  await expect(sortBtn).toHaveText("Tri des cadeaux : Alphabétique");
  await page.keyboard.press("Escape");

  await expect(page.locator(".item-name")).toHaveText(["Bananes", "Chocolat", "Yaourts"]);

  // La préférence (personnelle, par appareil) survit à un rechargement.
  await page.reload();
  await expect(page.locator(".conn-dot")).toHaveClass(/online/, { timeout: 10_000 });
  await expect(page.locator(".item-name")).toHaveText(["Bananes", "Chocolat", "Yaourts"]);
  await page.click("#btn-menu");
  await expect(page.locator('[data-action="item-sort"]')).toHaveText("Tri des cadeaux : Alphabétique");
});

test("masquer les cadeaux emballés est optionnel et persiste après un rechargement", async ({ page }) => {
  await page.goto("/");
  await page.click("#create-form button[type=submit]");
  await page.waitForURL(/\/l\//);
  await expect(page.locator(".conn-dot")).toHaveClass(/online/, { timeout: 10_000 });

  for (const name of ["Lego", "Livre"]) {
    await page.fill("#add-input", name);
    await page.click(".add-submit");
  }
  await markAsWrapped(page.locator(".item", { has: page.locator(".item-name", { hasText: "Livre" }) }));
  await expect(page.locator(".item-name")).toHaveText(["Lego", "Livre"]);

  const hideBtn = page.locator("#btn-hide-checked");
  await expect(hideBtn).toHaveAttribute("aria-pressed", "false");
  await hideBtn.click();
  await expect(hideBtn).toHaveAttribute("aria-pressed", "true");

  await expect(page.locator(".item-name")).toHaveText(["Lego"]);

  // La préférence (personnelle, par appareil) survit à un rechargement.
  await page.reload();
  await expect(page.locator(".conn-dot")).toHaveClass(/online/, { timeout: 10_000 });
  await expect(page.locator(".item-name")).toHaveText(["Lego"]);
  await expect(page.locator("#btn-hide-checked")).toHaveAttribute("aria-pressed", "true");

  // Emballer le dernier cadeau visible le fait disparaître aussitôt, avec un
  // message dédié plutôt que le message générique de liste vide.
  await markAsWrapped(page.locator(".item", { has: page.locator(".item-name", { hasText: "Lego" }) }));
  await expect(page.locator(".empty-state")).toHaveText("Tous les cadeaux sont emballés (et masqués).");

  await page.locator("#btn-hide-checked").click();
  await expect(page.locator("#btn-hide-checked")).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator(".item-name")).toHaveText(["Lego", "Livre"]);
});

test("glisser un cadeau vers la gauche le supprime (mobile), avec annulation possible", async ({ page }) => {
  await page.goto("/");
  await page.click("#create-form button[type=submit]");
  await page.waitForURL(/\/l\//);
  await expect(page.locator(".conn-dot")).toHaveClass(/online/, { timeout: 10_000 });

  await page.fill("#add-input", "Lego");
  await page.click(".add-submit");
  await expect(page.locator(".item")).toHaveCount(1);

  const item = page.locator(".item", { hasText: "Lego" });
  const box = await item.boundingBox();
  if (!box) throw new Error("cadeau introuvable");
  const y = box.y + box.height / 2;
  const startX = box.x + box.width / 2;

  // Un glissement trop court revient en place, ne supprime rien.
  await item.dispatchEvent("pointerdown", { pointerType: "touch", pointerId: 1, clientX: startX, clientY: y, bubbles: true });
  await item.dispatchEvent("pointermove", {
    pointerType: "touch",
    pointerId: 1,
    clientX: startX - 30,
    clientY: y,
    bubbles: true,
    cancelable: true,
  });
  await item.dispatchEvent("pointerup", { pointerType: "touch", pointerId: 1, clientX: startX - 30, clientY: y, bubbles: true });
  await expect(page.locator(".item")).toHaveCount(1);

  // Un glissement suffisant supprime le cadeau, avec annulation possible.
  await item.dispatchEvent("pointerdown", { pointerType: "touch", pointerId: 1, clientX: startX, clientY: y, bubbles: true });
  await item.dispatchEvent("pointermove", {
    pointerType: "touch",
    pointerId: 1,
    clientX: startX - 100,
    clientY: y,
    bubbles: true,
    cancelable: true,
  });
  await item.dispatchEvent("pointerup", { pointerType: "touch", pointerId: 1, clientX: startX - 100, clientY: y, bubbles: true });

  await expect(page.locator(".item")).toHaveCount(0);
  await expect(page.locator("#undo-toast")).toContainText("« Lego » supprimé");
  await page.click("#undo-toast button");
  await expect(page.locator(".item .item-name")).toHaveText("Lego");
});

test("ajouter, voir puis supprimer une photo sur un cadeau", async ({ page }) => {
  await page.goto("/");
  await page.click("#create-form button[type=submit]");
  await page.waitForURL(/\/l\//);
  await expect(page.locator(".conn-dot")).toHaveClass(/online/, { timeout: 10_000 });

  await page.fill("#add-input", "Lego");
  await page.click(".add-submit");
  await expect(page.locator(".item")).toHaveCount(1);

  // Sans photo : le bouton est vide (pas de <img> dedans) et ouvre le
  // sélecteur de fichier au clic plutôt qu'une visionneuse.
  const photoBtn = page.locator(".item-photo");
  await expect(photoBtn.locator("img")).toHaveCount(0);

  const pngPath = path.join(process.cwd(), "e2e", "fixtures", "pixel.png");
  const [fileChooser] = await Promise.all([page.waitForEvent("filechooser"), photoBtn.click()]);
  await fileChooser.setFiles(pngPath);

  await expect(photoBtn.locator("img")).toBeVisible({ timeout: 10_000 });

  // Avec une photo : cliquer ouvre la visionneuse plein écran.
  await photoBtn.click();
  await expect(page.locator(".image-lightbox-img")).toBeVisible();

  // Suppression (deux clics : armement puis confirmation) depuis la
  // visionneuse, qui se referme ensuite.
  await page.click(".image-lightbox-delete");
  await page.click(".image-lightbox-delete");
  await expect(page.locator(".image-lightbox-overlay")).toHaveCount(0);
  await expect(photoBtn.locator("img")).toHaveCount(0, { timeout: 10_000 });
});
