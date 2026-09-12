import { describe, it, expect } from "vitest";
import { applyMessage, nextOrder, validRecipientId, normalizeLink } from "./reducer";
import type { ListState } from "../shared/types";

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

const NOW = 1_700_000_000_000;

describe("nextOrder", () => {
  it("vaut 0 pour une liste vide", () => {
    expect(nextOrder([])).toBe(0);
  });
  it("vaut max(order) + 1 sinon", () => {
    expect(nextOrder([{ order: 0 }, { order: 5 }, { order: 2 }])).toBe(6);
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

describe("applyMessage", () => {
  it("sync ne modifie rien", () => {
    const state = makeState();
    const before = JSON.stringify(state);
    applyMessage(state, { type: "sync" }, NOW);
    expect(JSON.stringify(state)).toBe(before);
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
    it("ajoute un cadeau avec quantité extraite, sans image", () => {
      const state = makeState({ recipients: [{ id: "r1", name: "Marie", order: 0 }] });
      applyMessage(state, { type: "addItem", id: "i1", rawText: "2x Lego", recipientId: "r1" }, NOW);
      expect(state.items).toEqual([
        {
          id: "i1",
          name: "Lego",
          quantity: "x2",
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

    it("n'ajoute rien si le texte ne produit aucun nom (ex: quantité seule)", () => {
      const state = makeState();
      applyMessage(state, { type: "addItem", id: "i1", rawText: "3 kg", recipientId: null }, NOW);
      expect(state.items).toEqual([]);
    });
  });

  describe("updateItem", () => {
    function withItem(): ListState {
      return makeState({
        items: [
          {
            id: "i1",
            name: "Lego",
            quantity: "1",
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
      applyMessage(state, { type: "updateItem", id: "i1", quantity: "2" }, NOW);
      expect(state.items[0]).toMatchObject({ name: "Lego", quantity: "2", recipientId: null, updatedAt: NOW });
    });

    it("met à jour le nom quand il est fourni", () => {
      const state = withItem();
      applyMessage(state, { type: "updateItem", id: "i1", name: "Lego Star Wars" }, NOW);
      expect(state.items[0].name).toBe("Lego Star Wars");
    });

    it("permet de vider quantity/recipientId explicitement", () => {
      const state = withItem();
      applyMessage(state, { type: "updateItem", id: "i1", quantity: "", recipientId: null }, NOW);
      expect(state.items[0].quantity).toBe("");
      expect(state.items[0].recipientId).toBeNull();
    });

    it("met à jour le statut quand il est fourni", () => {
      const state = withItem();
      applyMessage(state, { type: "updateItem", id: "i1", status: "commande" }, NOW);
      expect(state.items[0].status).toBe("commande");
    });

    it("ne touche pas le statut quand il n'est pas fourni", () => {
      const state = withItem();
      applyMessage(state, { type: "updateItem", id: "i1", status: "commande" }, NOW);
      applyMessage(state, { type: "updateItem", id: "i1", quantity: "3" }, NOW);
      expect(state.items[0].status).toBe("commande");
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
      applyMessage(state, { type: "updateItem", id: "i1", quantity: "3" }, NOW);
      expect(state.items[0].link).toBe("https://exemple.fr");
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

  describe("toggleItem", () => {
    it("coche et décoche un cadeau", () => {
      const state = makeState({
        items: [
          {
            id: "i1",
            name: "Lego",
            quantity: "",
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
      applyMessage(state, { type: "toggleItem", id: "i1", checked: true }, NOW);
      expect(state.items[0].checked).toBe(true);
      expect(state.items[0].updatedAt).toBe(NOW);

      applyMessage(state, { type: "toggleItem", id: "i1", checked: false }, NOW + 1);
      expect(state.items[0].checked).toBe(false);
    });

    it("ignore un id inconnu", () => {
      const state = makeState();
      applyMessage(state, { type: "toggleItem", id: "nope", checked: true }, NOW);
      expect(state.items).toEqual([]);
    });
  });

  describe("deleteItem / clearChecked", () => {
    it("deleteItem retire uniquement le cadeau visé", () => {
      const state = makeState({
        items: [
          { id: "i1", name: "A", quantity: "", recipientId: null, checked: false, order: 0, createdAt: 0, updatedAt: 0, hasImage: false, imageVersion: 0 },
          { id: "i2", name: "B", quantity: "", recipientId: null, checked: false, order: 1, createdAt: 0, updatedAt: 0, hasImage: false, imageVersion: 0 },
        ],
      });
      applyMessage(state, { type: "deleteItem", id: "i1" }, NOW);
      expect(state.items.map((i) => i.id)).toEqual(["i2"]);
    });

    it("clearChecked retire tous les cadeaux cochés", () => {
      const state = makeState({
        items: [
          { id: "i1", name: "A", quantity: "", recipientId: null, checked: true, order: 0, createdAt: 0, updatedAt: 0, hasImage: false, imageVersion: 0 },
          { id: "i2", name: "B", quantity: "", recipientId: null, checked: false, order: 1, createdAt: 0, updatedAt: 0, hasImage: false, imageVersion: 0 },
          { id: "i3", name: "C", quantity: "", recipientId: null, checked: true, order: 2, createdAt: 0, updatedAt: 0, hasImage: false, imageVersion: 0 },
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
          { id: "i1", name: "A", quantity: "", recipientId: null, checked: false, order: 0, createdAt: 0, updatedAt: 0, hasImage: false, imageVersion: 0 },
          { id: "i2", name: "B", quantity: "", recipientId: null, checked: false, order: 1, createdAt: 0, updatedAt: 0, hasImage: false, imageVersion: 0 },
        ],
      });
      applyMessage(state, { type: "reorderItems", orderedIds: ["i2", "i1"] }, NOW);
      expect(state.items.find((i) => i.id === "i1")!.order).toBe(1);
      expect(state.items.find((i) => i.id === "i2")!.order).toBe(0);
    });

    it("laisse inchangé un cadeau absent de orderedIds", () => {
      const state = makeState({
        items: [{ id: "i1", name: "A", quantity: "", recipientId: null, checked: false, order: 7, createdAt: 0, updatedAt: 0, hasImage: false, imageVersion: 0 }],
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
            quantity: "",
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
        recipients: [{ id: "r1", name: "Marie", order: 0 }],
        items: [
          { id: "i1", name: "Lego", quantity: "", recipientId: "r1", checked: false, order: 0, createdAt: 0, updatedAt: 0, hasImage: false, imageVersion: 0 },
          { id: "i2", name: "Livre", quantity: "", recipientId: null, checked: false, order: 1, createdAt: 0, updatedAt: 0, hasImage: false, imageVersion: 0 },
        ],
      });
      applyMessage(state, { type: "deleteRecipient", id: "r1" }, NOW);
      expect(state.recipients).toEqual([]);
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
        items: [{ id: "old", name: "Old", quantity: "", recipientId: null, checked: false, order: 0, createdAt: 0, updatedAt: 0, hasImage: false, imageVersion: 0 }],
        recipients: [{ id: "oldr", name: "OldRecipient", order: 0 }],
      });
      const data = {
        name: "Nouvelle",
        items: [{ id: "new", name: "New", quantity: "", recipientId: null, checked: false, order: 0, createdAt: 0, updatedAt: 0, hasImage: false, imageVersion: 0 }],
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
        items: [{ id: "existing", name: "Lego", quantity: "", recipientId: null, checked: false, order: 0, createdAt: 0, updatedAt: 0, hasImage: false, imageVersion: 0 }],
      });
      applyMessage(
        state,
        {
          type: "importState",
          mode: "merge",
          data: {
            name: "",
            items: [
              { id: "dup", name: "lego", quantity: "1", recipientId: null, checked: false, order: 0, createdAt: 0, updatedAt: 0, hasImage: false, imageVersion: 0 },
              {
                id: "new",
                name: "Livre",
                quantity: "",
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
              { id: "a", name: "Sans destinataire", quantity: "", recipientId: null, checked: false, order: 0, createdAt: 0, updatedAt: 0, hasImage: false, imageVersion: 0 },
              {
                id: "b",
                name: "Destinataire fantôme",
                quantity: "",
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
  });

  describe("restoreItems (annulation d'une suppression)", () => {
    it("réinsère un cadeau supprimé tel quel (id, order, checked d'origine)", () => {
      const state = makeState();
      const item = {
        id: "i1",
        name: "Lego",
        quantity: "2",
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
        { id: "i1", name: "A", quantity: "", recipientId: null, checked: true, order: 0, createdAt: 0, updatedAt: 0, hasImage: false, imageVersion: 0 },
        { id: "i2", name: "B", quantity: "", recipientId: null, checked: true, order: 1, createdAt: 0, updatedAt: 0, hasImage: false, imageVersion: 0 },
      ];
      applyMessage(state, { type: "restoreItems", items }, NOW);
      expect(state.items.map((i) => i.id)).toEqual(["i1", "i2"]);
    });

    it("ignore un cadeau dont l'id existe déjà (idempotent)", () => {
      const existing = { id: "i1", name: "Lego", quantity: "", recipientId: null, checked: false, order: 0, createdAt: 0, updatedAt: 0, hasImage: false, imageVersion: 0 };
      const state = makeState({ items: [existing] });
      applyMessage(state, { type: "restoreItems", items: [{ ...existing, name: "Autre nom" }] }, NOW);
      expect(state.items).toEqual([existing]);
    });
  });

  describe("restoreRecipient (annulation d'une suppression de destinataire)", () => {
    it("recrée le destinataire et réassigne les cadeaux encore sans destinataire", () => {
      const state = makeState({
        items: [{ id: "i1", name: "Lego", quantity: "", recipientId: null, checked: false, order: 0, createdAt: 0, updatedAt: 0, hasImage: false, imageVersion: 0 }],
      });
      const recipient = { id: "r1", name: "Marie", order: 0 };
      applyMessage(state, { type: "restoreRecipient", recipient, itemIds: ["i1"] }, NOW);
      expect(state.recipients).toEqual([recipient]);
      expect(state.items[0].recipientId).toBe("r1");
    });

    it("ne recrée pas le destinataire s'il existe déjà (idempotent)", () => {
      const recipient = { id: "r1", name: "Marie", order: 0 };
      const state = makeState({ recipients: [recipient] });
      applyMessage(state, { type: "restoreRecipient", recipient, itemIds: [] }, NOW);
      expect(state.recipients).toEqual([recipient]);
    });

    it("ne reprend pas un cadeau que l'utilisateur a réassigné entre-temps", () => {
      const state = makeState({
        items: [{ id: "i1", name: "Lego", quantity: "", recipientId: "r2", checked: false, order: 0, createdAt: 0, updatedAt: 0, hasImage: false, imageVersion: 0 }],
      });
      const recipient = { id: "r1", name: "Marie", order: 0 };
      applyMessage(state, { type: "restoreRecipient", recipient, itemIds: ["i1"] }, NOW);
      // Le cadeau a été réassigné à "r2" pendant la fenêtre d'annulation :
      // la restauration ne doit pas l'arracher à ce nouveau choix.
      expect(state.items[0].recipientId).toBe("r2");
    });
  });
});
