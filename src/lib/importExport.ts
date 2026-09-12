import type { ListState } from "../../shared/types";

export type ImportPayload = Pick<ListState, "name" | "items" | "recipients">;

export function exportListState(state: ListState): void {
  const payload: ImportPayload & { exportedAt: number } = {
    name: state.name,
    recipients: state.recipients,
    items: state.items,
    exportedAt: Date.now(),
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const slug =
    state.name
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(new RegExp("[\\u0300-\\u036f]", "g"), "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "") || "liste";
  const a = document.createElement("a");
  a.href = url;
  a.download = `${slug}-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export async function parseImportFile(file: File): Promise<ImportPayload> {
  const text = await file.text();
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("Ce fichier n'est pas un JSON valide.");
  }
  if (
    typeof data !== "object" ||
    data === null ||
    !Array.isArray((data as ImportPayload).items) ||
    !Array.isArray((data as ImportPayload).recipients)
  ) {
    throw new Error("Ce fichier ne ressemble pas à un export de liste de cadeaux.");
  }
  const parsed = data as Partial<ImportPayload>;
  return {
    name: typeof parsed.name === "string" ? parsed.name : "",
    items: parsed.items ?? [],
    recipients: parsed.recipients ?? [],
  };
}
