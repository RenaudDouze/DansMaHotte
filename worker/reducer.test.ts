import { describe, it, expect } from "vitest";
import { applyMessage, nextOrder, validRecipientId, normalizeLink, normalizePrice } from "./reducer";
import { MAX_ITEMS_PER_LIST, MAX_NAME_LENGTH, MAX_RECIPIENTS_PER_LIST, type Item, type ListState, type Recipient } from "../shared/types";

function makeState(overrides: Partial<ListState> = {}): ListState {
  return {
    code: "ABCDEF",
    name: "Liste de cadeaux",
    items: [],
    recipients: [],
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

function fillerItems(count: number): Item[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `filler-${i}`,
    name: `Cadeau ${i}`,
    recipientId: null,
    checked: false,
    order: i,
    createdAt: 0,
    updatedAt: 0,
    hasImage: false,
    imageVersion: 0,
  }));
}

function fillerRecipients(count: number): Recipient[] {
  return Array.from({ length: count }, (_, i) => ({ id: `filler-r${i}`, name: `Personne ${i}`, order: i }));
}

function makeItem(overrides: Partial<Item> = {}): Item {
  return {
    id: "i1",
    name: "Cadeau",
    recipientId: null,
    checked: false,
    order: 0,
    createdAt: 0,
    updatedAt: 0,
    hasImage: false,
    imageVersion: 0,
    ...overrides,
  };
}

const NOW = 1_700_000_000_000;

describe("nextOrder", () => {
  it("vaut 0 pour une liste vide", () => {
    expect(nextOrder([])).toBe(0);
  });
  it("vaut max(order) + 1 sinon", () => {
    expect(nextOrder([{ order: 0 }, { order: 5 }, { order: 2 }])).toBe(6);
  });
});

describe("validRecipientId (suite)", () => {
  it("renvoie null pour un id inconnu même quand d'autres personnes existent", () => {
    const state = makeState({ recipients: [{ id: "r1", name: "Marie", order: 0 }] });
    expect(validRecipientId(state, "nope")).toBeNull();
    expect(validRecipientId(state, "r1")).toBe("r1");
  });
});

describe("validRecipientId", () => {
  it("retourne null tel quel", () => {
    expect(validRecipientId(makeState(), null)).toBeNull();
  });

  it("retourne l'id si le destinataire existe", () => {
    const state = makeState({ recipients: [{ id: "r1", name: "Marie", order: 0 }] });
    expect(validRecipientId(state, "r1")).toBe("r1");
  });

  it("retombe sur null si le destinataire n'existe pas (ex: supprimé entre-temps)", () => {
    expect(validRecipientId(makeState(), "ghost")).toBeNull();
  });
});

describe("normalizeLink", () => {
  it("renvoie une chaîne vide pour une entrée vide ou blanche", () => {
    expect(normalizeLink("")).toBe("");
    expect(normalizeLink("   ")).toBe("");
  });

  it("laisse une URL http(s) telle quelle (après trim)", () => {
    expect(normalizeLink("https://exemple.fr/cadeau")).toBe("https://exemple.fr/cadeau");
    expect(normalizeLink("  http://exemple.fr  ")).toBe("http://exemple.fr");
  });

  it("préfixe https:// quand le schéma est absent", () => {
    expect(normalizeLink("exemple.fr")).toBe("https://exemple.fr");
    expect(normalizeLink("www.exemple.fr")).toBe("https://www.exemple.fr");
  });

  it("est insensible à la casse du schéma", () => {
    expect(normalizeLink("HTTPS://exemple.fr")).toBe("HTTPS://exemple.fr");
  });
});

describe("normalizeLink (ancrage)", () => {
  it("ne reconnaît le schéma qu'en début de lien", () => {
    expect(normalizeLink("monsite.fr/?u=http://x")).toBe("https://monsite.fr/?u=http://x");
  });
});

describe("normalizePrice", () => {
  it("arrondit au centime", () => {
    expect(normalizePrice(19.999)).toBe(20);
    expect(normalizePrice(19.994)).toBe(19.99);
  });

  it("accepte 0", () => {
    expect(normalizePrice(0)).toBe(0);
  });

  it("rejette les valeurs négatives, NaN ou infinies", () => {
    expect(normalizePrice(-1)).toBeUndefined();
    expect(normalizePrice(Number.NaN)).toBeUndefined();
    expect(normalizePrice(Number.POSITIVE_INFINITY)).toBeUndefined();
    expect(normalizePrice(Number.NEGATIVE_INFINITY)).toBeUndefined();
  });
});

describe("applyMessage", () => {
  it("sync ne modifie rien", () => {
    const state = makeState();
    const before = JSON.stringify(state);
    applyMessage(state, { type: "sync" }, NOW);
    expect(JSON.stringify(state)).toBe(before);
  });

  describe("troncatures et champs optionnels", () => {
    it("renameList et addItem tronquent à MAX_NAME_LENGTH", () => {
      const state = makeState();
      applyMessage(state, { type: "renameList", name: "n".repeat(MAX_NAME_LENGTH + 5) }, NOW);
      expect(state.name).toBe("n".repeat(MAX_NAME_LENGTH));
      applyMessage(state, { type: "addItem", id: "i1", rawText: "c".repeat(MAX_NAME_LENGTH + 5), recipientId: null }, NOW);
      expect(state.items[0].name).toBe("c".repeat(MAX_NAME_LENGTH));
    });

    it("updateItem tronque le nom et ne touche pas aux champs absents du message", () => {
      const state = makeState({
        recipients: [{ id: "r1", name: "Marie", order: 0 }],
        items: [makeItem({ id: "i1", recipientId: "r1", price: 12.5 })],
      });
      applyMessage(state, { type: "updateItem", id: "i1", name: "x".repeat(MAX_NAME_LENGTH + 5) }, NOW);
      expect(state.items[0].name).toBe("x".repeat(MAX_NAME_LENGTH));
      expect(state.items[0].recipientId).toBe("r1");
      expect(state.items[0].price).toBe(12.5);
    });

    it("updateItem change la personne (id valide), l'efface (null) ou la rejette (id inconnu)", () => {
      const state = makeState({
        recipients: [{ id: "r1", name: "Marie", order: 0 }],
        items: [makeItem({ id: "i1" })],
      });
      applyMessage(state, { type: "updateItem", id: "i1", recipientId: "r1" }, NOW);
      expect(state.items[0].recipientId).toBe("r1");
      applyMessage(state, { type: "updateItem", id: "i1", recipientId: "nope" }, NOW);
      expect(state.items[0].recipientId).toBeNull();
    });

    it("updateItem modifie le bon cadeau parmi plusieurs", () => {
      const state = makeState({ items: [makeItem({ id: "i1", name: "A" }), makeItem({ id: "i2", name: "B" })] });
      applyMessage(state, { type: "updateItem", id: "i2", name: "B2" }, NOW);
      expect(state.items.map((i) => i.name)).toEqual(["A", "B2"]);
    });

    it("setItemImage ne modifie que le cadeau visé", () => {
      const state = makeState({ items: [makeItem({ id: "i1" }), makeItem({ id: "i2" })] });
      applyMessage(state, { type: "setItemImage", id: "i2", hasImage: true }, NOW);
      expect(state.items.map((i) => i.hasImage)).toEqual([false, true]);
    });
  });

  describe("renameList", () => {
    it("renomme avec un nom non vide (trim)", () => {
      const state = makeState();
      applyMessage(state, { type: "renameList", name: "  Cadeaux de Noël  " }, NOW);
      expect(state.name).toBe("Cadeaux de Noël");
    });
    it("ignore un nom blanc", () => {
      const state = makeState({ name: "Original" });
      applyMessage(state, { type: "renameList", name: "   " }, NOW);
      expect(state.name).toBe("Original");
    });
  });

  describe("addItem", () => {
    it("ajoute un cadeau, sans image", () => {
      const state = makeState({ recipients: [{ id: "r1", name: "Marie", order: 0 }] });
      applyMessage(state, { type: "addItem", id: "i1", rawText: "  Lego  ", recipientId: "r1" }, NOW);
      expect(state.items).toEqual([
        {
          id: "i1",
          name: "Lego",
          recipientId: "r1",
          checked: false,
          order: 0,
          status: "idee",
          createdAt: NOW,
          updatedAt: NOW,
          hasImage: false,
          imageVersion: 0,
        },
      ]);
    });

    it("retombe sur recipientId=null si le destinataire fourni n'existe pas (ex: supprimé entre-temps)", () => {
      const state = makeState();
      applyMessage(state, { type: "addItem", id: "i1", rawText: "Lego", recipientId: "deleted-recipient" }, NOW);
      expect(state.items[0].recipientId).toBeNull();
    });

    it("attribue des order croissants", () => {
      const state = makeState();
      applyMessage(state, { type: "addItem", id: "i1", rawText: "Lego", recipientId: null }, NOW);
      applyMessage(state, { type: "addItem", id: "i2", rawText: "Livre", recipientId: null }, NOW);
      expect(state.items.map((i) => i.order)).toEqual([0, 1]);
    });

    it("n'ajoute rien si le texte est vide ou blanc", () => {
      const state = makeState();
      applyMessage(state, { type: "addItem", id: "i1", rawText: "   ", recipientId: null }, NOW);
      expect(state.items).toEqual([]);
    });

    it("n'ajoute rien au-delà de MAX_ITEMS_PER_LIST cadeaux", () => {
      const state = makeState({ items: fillerItems(MAX_ITEMS_PER_LIST) });
      applyMessage(state, { type: "addItem", id: "new", rawText: "En trop", recipientId: null }, NOW);
      expect(state.items).toHaveLength(MAX_ITEMS_PER_LIST);
      expect(state.items.some((i) => i.id === "new")).toBe(false);
    });
  });

  describe("updateItem", () => {
    function withItem(): ListState {
      return makeState({
        items: [
          {
            id: "i1",
            name: "Lego",
            recipientId: null,
            checked: false,
            order: 0,
            createdAt: 0,
            updatedAt: 0,
            hasImage: false,
            imageVersion: 0,
          },
        ],
      });
    }

    it("met à jour uniquement les champs fournis", () => {
      const state = withItem();
      applyMessage(state, { type: "updateItem", id: "i1", recipientId: null }, NOW);
      expect(state.items[0]).toMatchObject({ name: "Lego", recipientId: null, updatedAt: NOW });
    });

    it("met à jour le nom quand il est fourni", () => {
      const state = withItem();
      applyMessage(state, { type: "updateItem", id: "i1", name: "Lego Star Wars" }, NOW);
      expect(state.items[0].name).toBe("Lego Star Wars");
    });

    it("met à jour le statut quand il est fourni", () => {
      const state = withItem();
      applyMessage(state, { type: "updateItem", id: "i1", status: "commande" }, NOW);
      expect(state.items[0].status).toBe("commande");
    });

    it("ne touche pas le statut quand il n'est pas fourni", () => {
      const state = withItem();
      applyMessage(state, { type: "updateItem", id: "i1", status: "commande" }, NOW);
      applyMessage(state, { type: "updateItem", id: "i1", name: "Lego 2" }, NOW);
      expect(state.items[0].status).toBe("commande");
    });

    // Pas de case à cocher séparée dans une liste de cadeaux : "checked"
    // suit automatiquement le statut "Emballé" (voir shared/types.ts).
    it("passe checked à true quand le statut devient emballe", () => {
      const state = withItem();
      applyMessage(state, { type: "updateItem", id: "i1", status: "emballe" }, NOW);
      expect(state.items[0].checked).toBe(true);
    });

    it("repasse checked à false quand le statut n'est plus emballe", () => {
      const state = withItem();
      applyMessage(state, { type: "updateItem", id: "i1", status: "emballe" }, NOW);
      applyMessage(state, { type: "updateItem", id: "i1", status: "recu" }, NOW);
      expect(state.items[0].checked).toBe(false);
    });

    it("met à jour le lien quand il est fourni, en le normalisant", () => {
      const state = withItem();
      applyMessage(state, { type: "updateItem", id: "i1", link: "exemple.fr/lego" }, NOW);
      expect(state.items[0].link).toBe("https://exemple.fr/lego");
    });

    it("permet de vider le lien explicitement", () => {
      const state = withItem();
      applyMessage(state, { type: "updateItem", id: "i1", link: "https://exemple.fr" }, NOW);
      applyMessage(state, { type: "updateItem", id: "i1", link: "" }, NOW);
      expect(state.items[0].link).toBe("");
    });

    it("ne touche pas le lien quand il n'est pas fourni", () => {
      const state = withItem();
      applyMessage(state, { type: "updateItem", id: "i1", link: "https://exemple.fr" }, NOW);
      applyMessage(state, { type: "updateItem", id: "i1", name: "Lego 2" }, NOW);
      expect(state.items[0].link).toBe("https://exemple.fr");
    });

    it("met à jour le prix quand il est fourni, en le normalisant", () => {
      const state = withItem();
      applyMessage(state, { type: "updateItem", id: "i1", price: 19.999 }, NOW);
      expect(state.items[0].price).toBe(20);
    });

    it("permet d'effacer le prix explicitement avec null", () => {
      const state = withItem();
      applyMessage(state, { type: "updateItem", id: "i1", price: 19.9 }, NOW);
      applyMessage(state, { type: "updateItem", id: "i1", price: null }, NOW);
      expect(state.items[0].price).toBeUndefined();
    });

    it("ignore un prix invalide (négatif, NaN, infini) plutôt que de le stocker", () => {
      const state = withItem();
      applyMessage(state, { type: "updateItem", id: "i1", price: 10 }, NOW);
      applyMessage(state, { type: "updateItem", id: "i1", price: -5 }, NOW);
      expect(state.items[0].price).toBe(10);
      applyMessage(state, { type: "updateItem", id: "i1", price: Number.NaN }, NOW);
      expect(state.items[0].price).toBe(10);
      applyMessage(state, { type: "updateItem", id: "i1", price: Number.POSITIVE_INFINITY }, NOW);
      expect(state.items[0].price).toBe(10);
    });

    it("ne touche pas le prix quand il n'est pas fourni", () => {
      const state = withItem();
      applyMessage(state, { type: "updateItem", id: "i1", price: 19.9 }, NOW);
      applyMessage(state, { type: "updateItem", id: "i1", name: "Lego 2" }, NOW);
      expect(state.items[0].price).toBe(19.9);
    });

    it("ignore un id inconnu", () => {
      const state = withItem();
      applyMessage(state, { type: "updateItem", id: "nope", name: "X" }, NOW);
      expect(state.items[0].name).toBe("Lego");
    });

    it("retombe sur recipientId=null si le nouveau destinataire fourni n'existe pas", () => {
      const state = withItem();
      applyMessage(state, { type: "updateItem", id: "i1", recipientId: "ghost" }, NOW);
      expect(state.items[0].recipientId).toBeNull();
    });
  });

  describe("deleteItem / clearChecked", () => {
    it("deleteItem retire uniquement le cadeau visé", () => {
      const state = makeState({
        items: [
          { id: "i1", name: "A", recipientId: null, checked: false, order: 0, createdAt: 0, updatedAt: 0, hasImage: false, imageVersion: 0 },
          { id: "i2", name: "B", recipientId: null, checked: false, order: 1, createdAt: 0, updatedAt: 0, hasImage: false, imageVersion: 0 },
        ],
      });
      applyMessage(state, { type: "deleteItem", id: "i1" }, NOW);
      expect(state.items.map((i) => i.id)).toEqual(["i2"]);
    });

    it("clearChecked retire tous les cadeaux cochés", () => {
      const state = makeState({
        items: [
          { id: "i1", name: "A", recipientId: null, checked: true, order: 0, createdAt: 0, updatedAt: 0, hasImage: false, imageVersion: 0 },
          { id: "i2", name: "B", recipientId: null, checked: false, order: 1, createdAt: 0, updatedAt: 0, hasImage: false, imageVersion: 0 },
          { id: "i3", name: "C", recipientId: null, checked: true, order: 2, createdAt: 0, updatedAt: 0, hasImage: false, imageVersion: 0 },
        ],
      });
      applyMessage(state, { type: "clearChecked" }, NOW);
      expect(state.items.map((i) => i.id)).toEqual(["i2"]);
    });
  });

  describe("reorderItems", () => {
    it("réassigne order selon la position dans orderedIds", () => {
      const state = makeState({
        items: [
          { id: "i1", name: "A", recipientId: null, checked: false, order: 0, createdAt: 0, updatedAt: 0, hasImage: false, imageVersion: 0 },
          { id: "i2", name: "B", recipientId: null, checked: false, order: 1, createdAt: 0, updatedAt: 0, hasImage: false, imageVersion: 0 },
        ],
      });
      applyMessage(state, { type: "reorderItems", orderedIds: ["i2", "i1"] }, NOW);
      expect(state.items.find((i) => i.id === "i1")!.order).toBe(1);
      expect(state.items.find((i) => i.id === "i2")!.order).toBe(0);
    });

    it("laisse inchangé un cadeau absent de orderedIds", () => {
      const state = makeState({
        items: [{ id: "i1", name: "A", recipientId: null, checked: false, order: 7, createdAt: 0, updatedAt: 0, hasImage: false, imageVersion: 0 }],
      });
      applyMessage(state, { type: "reorderItems", orderedIds: [] }, NOW);
      expect(state.items[0].order).toBe(7);
    });
  });

  describe("setItemImage", () => {
    function withItem(): ListState {
      return makeState({
        items: [
          {
            id: "i1",
            name: "Lego",
            recipientId: null,
            checked: false,
            order: 0,
            createdAt: 0,
            updatedAt: 0,
            hasImage: false,
            imageVersion: 0,
          },
        ],
      });
    }

    it("marque hasImage et incrémente imageVersion à l'ajout d'une photo", () => {
      const state = withItem();
      applyMessage(state, { type: "setItemImage", id: "i1", hasImage: true }, NOW);
      expect(state.items[0].hasImage).toBe(true);
      expect(state.items[0].imageVersion).toBe(1);
      expect(state.items[0].updatedAt).toBe(NOW);
    });

    it("incrémente aussi imageVersion à la suppression (invalide le cache navigateur)", () => {
      const state = withItem();
      applyMessage(state, { type: "setItemImage", id: "i1", hasImage: true }, NOW);
      applyMessage(state, { type: "setItemImage", id: "i1", hasImage: false }, NOW + 1);
      expect(state.items[0].hasImage).toBe(false);
      expect(state.items[0].imageVersion).toBe(2);
    });

    it("ignore un id inconnu", () => {
      const state = makeState();
      applyMessage(state, { type: "setItemImage", id: "nope", hasImage: true }, NOW);
      expect(state.items).toEqual([]);
    });
  });

  describe("destinataires", () => {
    it("addRecipient ajoute avec order croissant, ignore un nom blanc", () => {
      const state = makeState();
      applyMessage(state, { type: "addRecipient", id: "r1", name: "Marie" }, NOW);
      applyMessage(state, { type: "addRecipient", id: "r2", name: "  " }, NOW);
      expect(state.recipients).toEqual([{ id: "r1", name: "Marie", order: 0 }]);
    });

    it("addRecipient et renameRecipient tronquent le nom à MAX_NAME_LENGTH", () => {
      const state = makeState();
      applyMessage(state, { type: "addRecipient", id: "r1", name: "x".repeat(MAX_NAME_LENGTH + 50) }, NOW);
      expect(state.recipients[0].name).toHaveLength(MAX_NAME_LENGTH);
      applyMessage(state, { type: "renameRecipient", id: "r1", name: "y".repeat(MAX_NAME_LENGTH + 50) }, NOW);
      expect(state.recipients[0].name).toBe("y".repeat(MAX_NAME_LENGTH));
    });

    it("addRecipient n'ajoute rien au-delà de MAX_RECIPIENTS_PER_LIST personnes", () => {
      const state = makeState({ recipients: fillerRecipients(MAX_RECIPIENTS_PER_LIST) });
      applyMessage(state, { type: "addRecipient", id: "new", name: "En trop" }, NOW);
      expect(state.recipients).toHaveLength(MAX_RECIPIENTS_PER_LIST);
      expect(state.recipients.some((r) => r.id === "new")).toBe(false);
    });

    it("renameRecipient renomme, ignore id inconnu et nom blanc", () => {
      const state = makeState({ recipients: [{ id: "r1", name: "Marie", order: 0 }] });
      applyMessage(state, { type: "renameRecipient", id: "r1", name: "Marie-Claire" }, NOW);
      expect(state.recipients[0].name).toBe("Marie-Claire");
      applyMessage(state, { type: "renameRecipient", id: "r1", name: "  " }, NOW);
      expect(state.recipients[0].name).toBe("Marie-Claire");
      applyMessage(state, { type: "renameRecipient", id: "nope", name: "X" }, NOW);
      expect(state.recipients[0].name).toBe("Marie-Claire");
    });

    it("deleteRecipient retire le destinataire, déplace ses cadeaux vers null, laisse le reste intact", () => {
      const state = makeState({
        recipients: [
          { id: "r1", name: "Marie", order: 0 },
          { id: "r2", name: "Paul", order: 1 },
        ],
        items: [
          { id: "i1", name: "Lego", recipientId: "r1", checked: false, order: 0, createdAt: 0, updatedAt: 0, hasImage: false, imageVersion: 0 },
          { id: "i2", name: "Livre", recipientId: null, checked: false, order: 1, createdAt: 0, updatedAt: 0, hasImage: false, imageVersion: 0 },
          { id: "i3", name: "Puzzle", recipientId: "r2", checked: false, order: 2, createdAt: 0, updatedAt: 0, hasImage: false, imageVersion: 0 },
        ],
      });
      applyMessage(state, { type: "deleteRecipient", id: "r1" }, NOW);
      expect(state.items.find((i) => i.id === "i3")!.recipientId).toBe("r2");
      expect(state.recipients).toEqual([{ id: "r2", name: "Paul", order: 1 }]);
      expect(state.items.find((i) => i.id === "i1")!.recipientId).toBeNull();
      expect(state.items.find((i) => i.id === "i2")!.recipientId).toBeNull();
    });

    it("reorderRecipients réassigne order, laisse inchangé un destinataire absent de orderedIds", () => {
      const state = makeState({
        recipients: [
          { id: "r1", name: "A", order: 0 },
          { id: "r2", name: "B", order: 1 },
          { id: "r3", name: "C", order: 9 },
        ],
      });
      applyMessage(state, { type: "reorderRecipients", orderedIds: ["r2", "r1"] }, NOW);
      expect(state.recipients.find((r) => r.id === "r1")!.order).toBe(1);
      expect(state.recipients.find((r) => r.id === "r2")!.order).toBe(0);
      expect(state.recipients.find((r) => r.id === "r3")!.order).toBe(9);
    });

    describe("setRecipientColor", () => {
      it("fixe une couleur manuelle (teinte valide)", () => {
        const state = makeState({ recipients: [{ id: "r1", name: "Marie", order: 0 }] });
        applyMessage(state, { type: "setRecipientColor", id: "r1", color: 210 }, NOW);
        expect(state.recipients[0].color).toBe(210);
      });

      it("efface la couleur manuelle (retour à l'automatique) quand color est null", () => {
        const state = makeState({ recipients: [{ id: "r1", name: "Marie", order: 0, color: 210 }] });
        applyMessage(state, { type: "setRecipientColor", id: "r1", color: null }, NOW);
        expect(state.recipients[0].color).toBeUndefined();
      });

      it("ignore un id inconnu", () => {
        const state = makeState({ recipients: [{ id: "r1", name: "Marie", order: 0 }] });
        applyMessage(state, { type: "setRecipientColor", id: "nope", color: 210 }, NOW);
        expect(state.recipients[0].color).toBeUndefined();
      });

      it("accepte la teinte 0 (borne basse incluse)", () => {
        const state = makeState({ recipients: [{ id: "r1", name: "Marie", order: 0 }] });
        applyMessage(state, { type: "setRecipientColor", id: "r1", color: 0 }, NOW);
        expect(state.recipients[0].color).toBe(0);
      });

      it("ignore une teinte hors de [0, 360[ ou non entière", () => {
        const state = makeState({ recipients: [{ id: "r1", name: "Marie", order: 0 }] });
        applyMessage(state, { type: "setRecipientColor", id: "r1", color: -1 }, NOW);
        applyMessage(state, { type: "setRecipientColor", id: "r1", color: 360 }, NOW);
        applyMessage(state, { type: "setRecipientColor", id: "r1", color: 45.5 }, NOW);
        expect(state.recipients[0].color).toBeUndefined();
      });
    });
  });

  describe("importState", () => {
    it("mode replace remplace intégralement items/recipients et le nom si fourni", () => {
      const state = makeState({
        name: "Ancienne",
        items: [{ id: "old", name: "Old", recipientId: null, checked: false, order: 0, createdAt: 0, updatedAt: 0, hasImage: false, imageVersion: 0 }],
        recipients: [{ id: "oldr", name: "OldRecipient", order: 0 }],
      });
      const data = {
        name: "Nouvelle",
        items: [{ id: "new", name: "New", recipientId: null, checked: false, order: 0, createdAt: 0, updatedAt: 0, hasImage: false, imageVersion: 0 }],
        recipients: [{ id: "newr", name: "NewRecipient", order: 0 }],
      };
      applyMessage(state, { type: "importState", mode: "replace", data }, NOW);
      expect(state.name).toBe("Nouvelle");
      expect(state.items).toEqual(data.items);
      expect(state.recipients).toEqual(data.recipients);
    });

    it("mode replace conserve le nom actuel si data.name est vide", () => {
      const state = makeState({ name: "Ancienne" });
      applyMessage(state, { type: "importState", mode: "replace", data: { name: "", items: [], recipients: [] } }, NOW);
      expect(state.name).toBe("Ancienne");
    });

    it("remplace tout id importé qui n'est pas strictement [A-Za-z0-9_-]{1,64}", () => {
      const bad = ["ok id!", "!abc", "abc!", "a".repeat(65), ""];
      const state = makeState();
      const data = { name: "", recipients: [], items: bad.map((id, i) => makeItem({ id, name: `c${i}` })) };
      applyMessage(state, { type: "importState", mode: "replace", data }, NOW);
      for (const item of state.items) {
        expect(bad).not.toContain(item.id);
        expect(item.id).toMatch(/^[A-Za-z0-9_-]{1,64}$/);
      }
    });

    it("mode replace tronque le nom de liste importé et plafonne à MAX_RECIPIENTS_PER_LIST personnes", () => {
      const state = makeState();
      const data = {
        name: "L".repeat(MAX_NAME_LENGTH + 5),
        recipients: fillerRecipients(MAX_RECIPIENTS_PER_LIST + 3),
        items: [],
      };
      applyMessage(state, { type: "importState", mode: "replace", data }, NOW);
      expect(state.name).toBe("L".repeat(MAX_NAME_LENGTH));
      expect(state.recipients).toHaveLength(MAX_RECIPIENTS_PER_LIST);
    });

    it("mode merge : deux personnes importées de même nom (casse différente) n'en font qu'une", () => {
      const state = makeState();
      const data = {
        name: "",
        recipients: [
          { id: "a", name: "Marie", order: 0 },
          { id: "b", name: "marie", order: 1 },
        ],
        items: [makeItem({ id: "i1", name: "Lego", recipientId: "b" })],
      };
      applyMessage(state, { type: "importState", mode: "merge", data }, NOW);
      expect(state.recipients).toHaveLength(1);
      expect(state.items[0].recipientId).toBe(state.recipients[0].id);
    });

    it("mode merge : ignore un cadeau importé dont le nom ne diffère que par des espaces autour", () => {
      const state = makeState({ items: [makeItem({ id: "e1", name: "Livre" })] });
      const data = { name: "", recipients: [], items: [makeItem({ id: "i1", name: "  livre  " })] };
      applyMessage(state, { type: "importState", mode: "merge", data }, NOW);
      expect(state.items).toHaveLength(1);
    });

    it("mode replace tronque les noms de personne et de cadeau à MAX_NAME_LENGTH", () => {
      const state = makeState();
      const data = {
        name: "",
        recipients: [{ id: "r1", name: "p".repeat(MAX_NAME_LENGTH + 10), order: 0 }],
        items: [makeItem({ id: "i1", name: "c".repeat(MAX_NAME_LENGTH + 10) })],
      };
      applyMessage(state, { type: "importState", mode: "replace", data }, NOW);
      expect(state.recipients[0].name).toBe("p".repeat(MAX_NAME_LENGTH));
      expect(state.items[0].name).toBe("c".repeat(MAX_NAME_LENGTH));
    });

    it("mode replace retire un prix absent ou non numérique au lieu de le recopier", () => {
      const state = makeState();
      const data = {
        name: "",
        recipients: [],
        items: [
          makeItem({ id: "i1", name: "Sans prix" }),
          makeItem({ id: "i2", name: "Prix texte", price: "12" as unknown as number }),
        ],
      };
      applyMessage(state, { type: "importState", mode: "replace", data }, NOW);
      expect(state.items.map((i) => "price" in i)).toEqual([false, false]);
    });

    it("mode replace ne garde que MAX_ITEMS_PER_LIST cadeaux", () => {
      const state = makeState();
      const items = fillerItems(MAX_ITEMS_PER_LIST + 5);
      applyMessage(state, { type: "importState", mode: "replace", data: { name: "", recipients: [], items } }, NOW);
      expect(state.items).toHaveLength(MAX_ITEMS_PER_LIST);
    });

    it("mode merge rattache un cadeau importé à la personne déjà présente du même nom", () => {
      const state = makeState({ recipients: [{ id: "r-local", name: "Marie", order: 0 }] });
      const data = {
        name: "",
        recipients: [{ id: "r-import", name: "marie", order: 0 }],
        items: [makeItem({ id: "i1", name: "Lego", recipientId: "r-import" })],
      };
      applyMessage(state, { type: "importState", mode: "merge", data }, NOW);
      expect(state.recipients).toHaveLength(1);
      expect(state.items[0].recipientId).toBe("r-local");
    });

    it("mode merge compare les noms de cadeaux sans tenir compte des espaces autour, y compris côté existant", () => {
      const state = makeState({ items: [makeItem({ id: "e1", name: "  Livre  " })] });
      const data = { name: "", recipients: [], items: [makeItem({ id: "i1", name: "livre" })] };
      applyMessage(state, { type: "importState", mode: "merge", data }, NOW);
      expect(state.items).toHaveLength(1);
    });

    it("mode merge fusionne les destinataires par nom (insensible à la casse) sans dupliquer", () => {
      const state = makeState({ recipients: [{ id: "existing", name: "Marie", order: 0 }] });
      applyMessage(
        state,
        {
          type: "importState",
          mode: "merge",
          data: {
            name: "",
            items: [],
            recipients: [
              { id: "imported-marie", name: "marie", order: 0 },
              { id: "imported-paul", name: "Paul", order: 1 },
            ],
          },
        },
        NOW,
      );
      // "marie" (casse différente) fusionne avec l'existant, pas de doublon.
      expect(state.recipients.filter((r) => r.name.toLowerCase() === "marie")).toHaveLength(1);
      expect(state.recipients.some((r) => r.name === "Paul")).toBe(true);
      expect(state.recipients).toHaveLength(2);
    });

    it("mode merge ajoute les cadeaux nouveaux, ignore les doublons par nom, et remappe leur destinataire importé", () => {
      const state = makeState({
        items: [{ id: "existing", name: "Lego", recipientId: null, checked: false, order: 0, createdAt: 0, updatedAt: 0, hasImage: false, imageVersion: 0 }],
      });
      applyMessage(
        state,
        {
          type: "importState",
          mode: "merge",
          data: {
            name: "",
            items: [
              { id: "dup", name: "lego", recipientId: null, checked: false, order: 0, createdAt: 0, updatedAt: 0, hasImage: false, imageVersion: 0 },
              {
                id: "new",
                name: "Livre",
                recipientId: "imported-recipient",
                checked: false,
                order: 0,
                createdAt: 0,
                updatedAt: 0,
                hasImage: false,
                imageVersion: 0,
              },
            ],
            recipients: [{ id: "imported-recipient", name: "Marie", order: 0 }],
          },
        },
        NOW,
      );
      // "lego" existait déjà (même nom insensible à la casse) : pas de doublon.
      expect(state.items.filter((i) => i.name.toLowerCase() === "lego")).toHaveLength(1);
      const livre = state.items.find((i) => i.name === "Livre")!;
      expect(livre).toBeDefined();
      // Le destinataire importé "Marie" a été créé dans l'état courant, et le
      // cadeau importé pointe vers son nouvel id (pas l'id d'origine).
      const marie = state.recipients.find((r) => r.name === "Marie")!;
      expect(marie).toBeDefined();
      expect(livre.recipientId).toBe(marie.id);
    });

    it("mode merge laisse recipientId à null si le cadeau importé n'en a pas, ou si le destinataire importé est introuvable", () => {
      const state = makeState();
      applyMessage(
        state,
        {
          type: "importState",
          mode: "merge",
          data: {
            name: "",
            items: [
              { id: "a", name: "Sans destinataire", recipientId: null, checked: false, order: 0, createdAt: 0, updatedAt: 0, hasImage: false, imageVersion: 0 },
              {
                id: "b",
                name: "Destinataire fantôme",
                recipientId: "n-existe-pas",
                checked: false,
                order: 0,
                createdAt: 0,
                updatedAt: 0,
                hasImage: false,
                imageVersion: 0,
              },
            ],
            recipients: [],
          },
        },
        NOW,
      );
      expect(state.items.find((i) => i.name === "Sans destinataire")!.recipientId).toBeNull();
      expect(state.items.find((i) => i.name === "Destinataire fantôme")!.recipientId).toBeNull();
    });

    // Un fichier importé (ou un message importState forgé à la main, voir
    // src/views/list.ts et worker/reducer.ts) n'est pas soumis aux mêmes
    // contraintes de forme qu'un champ de formulaire : ces tests couvrent la
    // normalisation appliquée spécifiquement à ce cas (id, lien, prix).
    it("mode replace remplace un id dangereux (ou non-string) par un id généré, normalise lien/prix, et remappe recipientId", () => {
      const state = makeState();
      const data = {
        name: "",
        recipients: [{ id: '"><img src=x onerror=alert(1)>', name: "Marie", order: 0 }],
        items: [
          {
            id: 12345 as unknown as string,
            name: "Cadeau",
            recipientId: '"><img src=x onerror=alert(1)>',
            checked: false,
            order: 0,
            createdAt: 0,
            updatedAt: 0,
            hasImage: false,
            imageVersion: 0,
            link: "exemple.fr",
            price: 19.9,
          },
          {
            id: "cadeau-2",
            name: "Cadeau 2",
            recipientId: "n-existe-pas-dans-le-fichier",
            checked: false,
            order: 0,
            createdAt: 0,
            updatedAt: 0,
            hasImage: false,
            imageVersion: 0,
            price: -5,
          },
        ],
      };
      applyMessage(state, { type: "importState", mode: "replace", data }, NOW);

      const marie = state.recipients.find((r) => r.name === "Marie")!;
      expect(marie.id).not.toBe('"><img src=x onerror=alert(1)>');
      expect(marie.id).not.toMatch(/[<>"]/);

      const cadeau = state.items.find((i) => i.name === "Cadeau")!;
      expect(typeof cadeau.id).toBe("string");
      expect(cadeau.id).not.toBe(12345);
      // Remappé vers le nouvel id (pas dangereux) du même destinataire importé.
      expect(cadeau.recipientId).toBe(marie.id);
      expect(cadeau.link).toBe("https://exemple.fr");
      expect(cadeau.price).toBe(19.9);

      const cadeau2 = state.items.find((i) => i.name === "Cadeau 2")!;
      // Référence un destinataire absent du fichier importé : retombe à null.
      expect(cadeau2.recipientId).toBeNull();
      // Prix invalide (négatif) : ignoré plutôt que stocké tel quel.
      expect(cadeau2.price).toBeUndefined();
    });

    it("mode merge n'ajoute ni destinataire ni cadeau au-delà des plafonds, même si le fichier importé en contient plus", () => {
      const state = makeState({
        recipients: fillerRecipients(MAX_RECIPIENTS_PER_LIST),
        items: fillerItems(MAX_ITEMS_PER_LIST),
      });
      applyMessage(
        state,
        {
          type: "importState",
          mode: "merge",
          data: {
            name: "",
            recipients: [{ id: "new-r", name: "En trop", order: 0 }],
            items: [
              {
                id: "new-i",
                name: "En trop aussi",
                recipientId: null,
                checked: false,
                order: 0,
                createdAt: 0,
                updatedAt: 0,
                hasImage: false,
                imageVersion: 0,
              },
            ],
          },
        },
        NOW,
      );
      expect(state.recipients).toHaveLength(MAX_RECIPIENTS_PER_LIST);
      expect(state.items).toHaveLength(MAX_ITEMS_PER_LIST);
      expect(state.recipients.some((r) => r.name === "En trop")).toBe(false);
      expect(state.items.some((i) => i.name === "En trop aussi")).toBe(false);
    });
  });

  describe("restoreItems (annulation d'une suppression)", () => {
    it("réinsère un cadeau supprimé tel quel (id, order, checked d'origine)", () => {
      const state = makeState();
      const item = {
        id: "i1",
        name: "Lego",
        recipientId: "r1",
        checked: true,
        order: 3,
        createdAt: 111,
        updatedAt: 222,
        hasImage: false,
        imageVersion: 0,
      };
      applyMessage(state, { type: "restoreItems", items: [item] }, NOW);
      expect(state.items).toEqual([item]);
    });

    it("réinsère plusieurs cadeaux à la fois (annulation de « vider les cochés »)", () => {
      const state = makeState();
      const items = [
        { id: "i1", name: "A", recipientId: null, checked: true, order: 0, createdAt: 0, updatedAt: 0, hasImage: false, imageVersion: 0 },
        { id: "i2", name: "B", recipientId: null, checked: true, order: 1, createdAt: 0, updatedAt: 0, hasImage: false, imageVersion: 0 },
      ];
      applyMessage(state, { type: "restoreItems", items }, NOW);
      expect(state.items.map((i) => i.id)).toEqual(["i1", "i2"]);
    });

    it("ignore un cadeau dont l'id existe déjà (idempotent)", () => {
      const existing = { id: "i1", name: "Lego", recipientId: null, checked: false, order: 0, createdAt: 0, updatedAt: 0, hasImage: false, imageVersion: 0 };
      const state = makeState({ items: [existing] });
      applyMessage(state, { type: "restoreItems", items: [{ ...existing, name: "Autre nom" }] }, NOW);
      expect(state.items).toEqual([existing]);
    });
  });

  describe("restoreRecipient (annulation d'une suppression de destinataire)", () => {
    it("recrée le destinataire et réassigne les cadeaux encore sans destinataire", () => {
      const state = makeState({
        items: [{ id: "i1", name: "Lego", recipientId: null, checked: false, order: 0, createdAt: 0, updatedAt: 0, hasImage: false, imageVersion: 0 }],
      });
      const recipient = { id: "r1", name: "Marie", order: 0 };
      applyMessage(state, { type: "restoreRecipient", recipient, itemIds: ["i1"] }, NOW);
      expect(state.recipients).toEqual([recipient]);
      expect(state.items[0].recipientId).toBe("r1");
    });

    it("recrée le destinataire même quand d'autres personnes existent déjà", () => {
      const other = { id: "r2", name: "Paul", order: 0 };
      const recipient = { id: "r1", name: "Marie", order: 1 };
      const state = makeState({ recipients: [other] });
      applyMessage(state, { type: "restoreRecipient", recipient, itemIds: [] }, NOW);
      expect(state.recipients).toEqual([other, recipient]);
    });

    it("ne recrée pas le destinataire s'il existe déjà (idempotent)", () => {
      const recipient = { id: "r1", name: "Marie", order: 0 };
      const state = makeState({ recipients: [recipient] });
      applyMessage(state, { type: "restoreRecipient", recipient, itemIds: [] }, NOW);
      expect(state.recipients).toEqual([recipient]);
    });

    it("ne reprend pas un cadeau que l'utilisateur a réassigné entre-temps", () => {
      const state = makeState({
        items: [{ id: "i1", name: "Lego", recipientId: "r2", checked: false, order: 0, createdAt: 0, updatedAt: 0, hasImage: false, imageVersion: 0 }],
      });
      const recipient = { id: "r1", name: "Marie", order: 0 };
      applyMessage(state, { type: "restoreRecipient", recipient, itemIds: ["i1"] }, NOW);
      // Le cadeau a été réassigné à "r2" pendant la fenêtre d'annulation :
      // la restauration ne doit pas l'arracher à ce nouveau choix.
      expect(state.items[0].recipientId).toBe("r2");
    });
  });
});
