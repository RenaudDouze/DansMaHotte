// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { showUpdateBanner, watchOffline } from "./pwaBanner";

beforeEach(() => {
  document.body.innerHTML = "";
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("showUpdateBanner", () => {
  it("affiche le bandeau de mise à jour avec sa structure exacte", () => {
    showUpdateBanner(() => {});
    const banner = document.getElementById("update-banner")!;
    expect(banner.parentElement).toBe(document.body);
    expect(banner.getAttributeNames().sort()).toEqual(["class", "id", "role"]);
    expect(banner.className).toBe("pwa-banner");
    expect(banner.getAttribute("role")).toBe("status");
    expect(banner.querySelector("span")!.textContent).toBe("Une nouvelle version est disponible.");
    const buttons = [...banner.querySelectorAll("button")];
    expect(buttons.map((b) => [b.id, b.type, b.className, b.textContent])).toEqual([
      ["update-reload", "button", "btn", "Recharger"],
      ["update-later", "button", "btn", "Plus tard"],
    ]);
  });

  it("« Recharger » appelle le rappel et laisse le bandeau en place", () => {
    const onReload = vi.fn();
    showUpdateBanner(onReload);
    document.getElementById("update-reload")!.click();
    expect(onReload).toHaveBeenCalledTimes(1);
    expect(document.getElementById("update-banner")).not.toBeNull();
  });

  it("« Plus tard » ferme le bandeau sans recharger", () => {
    const onReload = vi.fn();
    showUpdateBanner(onReload);
    document.getElementById("update-later")!.click();
    expect(document.getElementById("update-banner")).toBeNull();
    expect(onReload).not.toHaveBeenCalled();
  });
});

describe("watchOffline", () => {
  function setOnLine(value: boolean) {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(value);
  }

  it("crée le bandeau avec sa structure exacte", () => {
    setOnLine(true);
    watchOffline();
    const banner = document.getElementById("offline-banner")!;
    expect(banner.parentElement).toBe(document.body);
    expect(banner.getAttributeNames().sort()).toEqual(["class", "hidden", "id", "role"]);
    expect(banner.className).toBe("pwa-banner");
    expect(banner.getAttribute("role")).toBe("status");
    expect(banner.textContent).toBe("Hors ligne : les modifications seront envoyées au retour du réseau.");
  });

  it("est masqué quand le navigateur est en ligne", () => {
    setOnLine(true);
    watchOffline();
    expect(document.getElementById("offline-banner")!.hidden).toBe(true);
  });

  it("est visible quand le navigateur démarre hors ligne", () => {
    setOnLine(false);
    watchOffline();
    expect(document.getElementById("offline-banner")!.hidden).toBe(false);
  });

  it("suit les événements offline puis online", () => {
    setOnLine(true);
    watchOffline();
    const banner = document.getElementById("offline-banner")!;
    window.dispatchEvent(new Event("offline"));
    expect(banner.hidden).toBe(false);
    window.dispatchEvent(new Event("online"));
    expect(banner.hidden).toBe(true);
  });
});
