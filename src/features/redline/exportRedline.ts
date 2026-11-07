// "Export redline": save the comparison as a standalone HTML file.

import { save } from "@tauri-apps/plugin-dialog";
import { api, errorMessage } from "../../api/commands";
import type { DiffDocument } from "../../api/types";
import { buildRedlineHtml } from "../../lib/exportHtml";
import { fileName } from "../../lib/format";
import { useUi } from "../../store/ui";

export async function exportRedline(diff: DiffDocument, documentPath: string | null): Promise<void> {
  const ui = useUi.getState();
  const title = documentPath ? fileName(documentPath) : "Document comparison";
  const path = await save({
    defaultPath: `${title.replace(/\.docx$/i, "")} - redline.html`,
    filters: [{ name: "HTML", extensions: ["html"] }],
  });
  if (!path) return;
  try {
    await api.saveTextFile(path, buildRedlineHtml(diff, title));
    ui.toast("success", `Saved ${fileName(path)}`);
  } catch (e) {
    ui.toast("error", errorMessage(e));
  }
}
