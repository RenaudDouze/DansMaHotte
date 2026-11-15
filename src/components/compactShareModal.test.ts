// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { openCompactShareModal } from "./compactShareModal";

vi.mock("./qr", () => ({
  renderQrSvg: vi.fn(async (text: string) => `<svg data-text="${text}"></svg>`),
}));

async function flushPromises(): Promise<void> {
  for (let i = 0; i < 5; i++) await Promise.resolve();
}

describe("openCompactShareModal", () => {
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

  it("affiche le nom (échappé), l'explication et le lien", () => {
    openCompactShareModal("http://x/?import=abc", "<i>Noël</i>");
    expect(document.querySelector("h2")!.textContent).toBe("Lien compact « <i>Noël</i> »");
    expect(document.querySelector("h2 i")).toBeNull();
    expect(document.querySelector(".add-form-hint")!.textContent).toContain("copie figée de la liste");
    expect(document.querySelector(".share-link")!.textContent).toBe("http://x/?import=abc");
  });

  it("génère le QR code du lien", async () => {
    openCompactShareModal("http://x/?import=abc", "Noël");
    await flushPromises();
    expect(document.querySelector("#qr-wrap")!.innerHTML).toContain('data-text="http://x/?import=abc"');
  });

  it("copie le lien avec une confirmation temporaire, même si la copie échoue", async () => {
    openCompactShareModal("http://x/?import=abc", "Noël");
    const btn = document.querySelector("#copy-compact-link") as HTMLButtonElement;
    btn.click();
    await flushPromises();
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith("http://x/?import=abc");
    expect(btn.textContent).toBe("Copié !");
    vi.advanceTimersByTime(1200);
    expect(btn.textContent).toBe("Copier le lien");

    (navigator.clipboard.writeText as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("denied"));
    btn.click();
    await flushPromises();
    expect(btn.textContent).toBe("Copié !");
  });

  it("sans API de partage native : pas de bouton ; avec : partage, et ignore une annulation", async () => {
    openCompactShareModal("http://x/?import=abc", "Noël");
    expect(document.querySelector("#native-share-compact")).toBeNull();
    expect(document.querySelector(".share-actions")!.textContent!.replace(/\s+/g, " ").trim()).toBe("Copier le lien");
    document.body.innerHTML = "";

    const share = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "share", { value: share, configurable: true });
    openCompactShareModal("http://x/?import=abc", "Noël");
    (document.querySelector("#native-share-compact") as HTMLButtonElement).click();
    await flushPromises();
    expect(share).toHaveBeenCalledWith({ title: "Noël", url: "http://x/?import=abc" });
    share.mockRejectedValue(new Error("AbortError"));
    (document.querySelector("#native-share-compact") as HTMLButtonElement).click();
    await flushPromises();
    expect(document.querySelector(".modal-overlay")).not.toBeNull();
  });

  it("ferme la modale : bouton, Échap (une seule fois), fond mais pas fenêtre ; rend le focus", () => {
    const outside = document.createElement("button");
    document.body.appendChild(outside);
    outside.focus();
    const remove = vi.spyOn(document, "removeEventListener");
    openCompactShareModal("u", "n");
    (document.querySelector(".modal") as HTMLElement).click();
    expect(document.querySelector(".modal-overlay")).not.toBeNull();
    (document.querySelector(".modal-close") as HTMLElement).click();
    expect(document.querySelector(".modal-overlay")).toBeNull();
    expect(remove.mock.calls.map(([type]) => type)).toContain("keydown");
    expect(document.activeElement).toBe(outside);

    openCompactShareModal("u", "n");
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "a" }));
    expect(document.querySelector(".modal-overlay")).not.toBeNull();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(document.querySelector(".modal-overlay")).toBeNull();

    openCompactShareModal("u", "n");
    (document.querySelector(".modal-overlay") as HTMLElement).click();
    expect(document.querySelector(".modal-overlay")).toBeNull();
  });
});
