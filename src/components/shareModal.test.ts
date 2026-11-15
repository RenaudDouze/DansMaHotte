// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { openShareModal } from "./shareModal";

vi.mock("./qr", () => ({
  renderQrSvg: vi.fn(async (text: string) => `<svg data-text="${text}"></svg>`),
}));

async function flushPromises(): Promise<void> {
  for (let i = 0; i < 5; i++) await Promise.resolve();
}

function open(actions?: Partial<{ onExport: () => void; onImportFile: (file: File) => void; onCompactShare: () => void }>) {
  const onExport = actions?.onExport ?? vi.fn();
  const onImportFile = actions?.onImportFile ?? vi.fn();
  const onCompactShare = actions?.onCompactShare ?? vi.fn();
  openShareModal("ABCDEF", "Noël", { onExport, onImportFile, onCompactShare });
  return { onExport, onImportFile, onCompactShare };
}

const stray = (el: Element) => Array.from(el.childNodes).filter((n) => n.nodeType === Node.TEXT_NODE && n.textContent!.trim() !== "");

describe("openShareModal", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = "";
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
      configurable: true,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    delete (navigator as unknown as Record<string, unknown>).clipboard;
    delete (navigator as unknown as Record<string, unknown>).share;
  });

  it("affiche le code, le nom (échappé) et le lien de partage", () => {
    openShareModal("ABCDEF", "<b>Noël</b>", { onExport: vi.fn(), onImportFile: vi.fn(), onCompactShare: vi.fn() });
    const overlay = document.querySelector(".modal-overlay") as HTMLElement;

    expect(overlay.querySelector("h2")?.textContent).toBe("Partager « <b>Noël</b> »");
    expect(overlay.querySelector("h2 b")).toBeNull();
    expect(overlay.querySelector(".share-code")?.textContent).toBe("ABCDEF");
    expect(overlay.querySelector(".share-link")?.textContent).toBe(`${location.origin}/l/ABCDEF`);
  });

  it("génère le QR code du lien de façon asynchrone", async () => {
    open();
    await flushPromises();
    expect(document.querySelector("#qr-wrap")?.innerHTML).toContain(`data-text="${location.origin}/l/ABCDEF"`);
  });

  it("sans API de partage native, la première rangée ne contient que copier lien/code", () => {
    open();
    const row = document.querySelector(".share-actions") as HTMLElement;
    expect(row.textContent!.replace(/\s+/g, " ").trim()).toBe("Copier le lien Copier le code");
    expect(document.querySelector("#native-share")).toBeNull();
  });

  it("copie le lien et le code, avec une confirmation temporaire", async () => {
    open();
    const writeText = navigator.clipboard.writeText as ReturnType<typeof vi.fn>;
    const copyLink = document.querySelector("#copy-link") as HTMLButtonElement;
    const copyCode = document.querySelector("#copy-code") as HTMLButtonElement;

    copyLink.click();
    await flushPromises();
    expect(writeText).toHaveBeenCalledWith(`${location.origin}/l/ABCDEF`);
    expect(copyLink.textContent).toBe("Copié !");
    vi.advanceTimersByTime(1200);
    expect(copyLink.textContent).toBe("Copier le lien");

    copyCode.click();
    await flushPromises();
    expect(writeText).toHaveBeenCalledWith("ABCDEF");
    expect(copyCode.textContent).toBe("Copié !");
  });

  it("ignore une copie impossible (API presse-papiers indisponible)", async () => {
    (navigator.clipboard.writeText as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("denied"));
    open();
    (document.querySelector("#copy-link") as HTMLButtonElement).click();
    await flushPromises();
    expect(document.querySelector("#copy-link")?.textContent).toBe("Copié !");
  });

  it("propose le partage natif quand le navigateur le permet, et ignore une annulation", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "share", { value: share, configurable: true });
    open();
    (document.querySelector("#native-share") as HTMLButtonElement).click();
    await flushPromises();
    expect(share).toHaveBeenCalledWith({ title: "Noël", url: `${location.origin}/l/ABCDEF` });

    share.mockRejectedValue(new Error("AbortError"));
    (document.querySelector("#native-share") as HTMLButtonElement).click();
    await flushPromises();
    expect(document.querySelector(".modal-overlay")).not.toBeNull();
  });

  it("ferme la modale : bouton, Échap (une seule fois), clic sur le fond mais pas dans la fenêtre", () => {
    const outside = document.createElement("button");
    document.body.appendChild(outside);
    outside.focus();
    const remove = vi.spyOn(document, "removeEventListener");
    open();
    (document.querySelector(".modal") as HTMLElement).click();
    expect(document.querySelector(".modal-overlay")).not.toBeNull();

    (document.querySelector(".modal-close") as HTMLElement).click();
    expect(document.querySelector(".modal-overlay")).toBeNull();
    expect(remove.mock.calls.map(([type]) => type)).toContain("keydown");
    expect(document.activeElement).toBe(outside);

    open();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "a" }));
    expect(document.querySelector(".modal-overlay")).not.toBeNull();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(document.querySelector(".modal-overlay")).toBeNull();

    open();
    (document.querySelector(".modal-overlay") as HTMLElement).click();
    expect(document.querySelector(".modal-overlay")).toBeNull();
  });

  it("lien compact et export ferment la modale puis déclenchent l'action", () => {
    const { onCompactShare, onExport } = open();
    (document.querySelector("#share-compact") as HTMLButtonElement).click();
    expect(document.querySelector(".modal-overlay")).toBeNull();
    expect(onCompactShare).toHaveBeenCalledOnce();

    open({ onExport });
    (document.querySelector("#share-export") as HTMLButtonElement).click();
    expect(document.querySelector(".modal-overlay")).toBeNull();
    expect(onExport).toHaveBeenCalledOnce();
  });

  it("importer : ouvre le sélecteur de fichier, puis transmet le fichier choisi et ferme", () => {
    const { onImportFile } = open();
    const input = document.querySelector("#share-import-file") as HTMLInputElement;
    const click = vi.spyOn(input, "click").mockImplementation(() => {});
    (document.querySelector("#share-import") as HTMLButtonElement).click();
    expect(click).toHaveBeenCalledOnce();

    const file = new File(["{}"], "liste.json", { type: "application/json" });
    Object.defineProperty(input, "files", { value: [file], configurable: true });
    input.dispatchEvent(new Event("change"));

    expect(onImportFile).toHaveBeenCalledWith(file);
    expect(document.querySelector(".modal-overlay")).toBeNull();
  });

  it("annuler le sélecteur de fichier ne ferme rien", () => {
    const { onImportFile } = open();
    const input = document.querySelector("#share-import-file") as HTMLInputElement;
    Object.defineProperty(input, "files", { value: [], configurable: true });
    input.dispatchEvent(new Event("change"));
    expect(onImportFile).not.toHaveBeenCalled();
    expect(document.querySelector(".modal-overlay")).not.toBeNull();
  });

  it("n'insère aucun texte parasite dans les rangées d'actions", () => {
    open();
    for (const row of Array.from(document.querySelectorAll(".share-actions"))) expect(stray(row)).toEqual([]);
  });
});
