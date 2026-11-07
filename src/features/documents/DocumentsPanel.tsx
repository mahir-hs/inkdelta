// The project's Word documents, and the timeline of versions of the selected one.

import { FileText, FolderOpen } from "lucide-react";
import { relativeTime, splitPath, versionKey } from "../../lib/format";
import { S } from "../../strings";
import { useWorkspace } from "../../store/workspace";

export function DocumentsPanel() {
  const { repo, file, versions, oldKey, newKey } = useWorkspace();
  const ws = useWorkspace.getState;

  if (!repo) {
    return (
      <div className="empty-panel">
        <p>Your project's Word documents and their versions appear here.</p>
        <button className="primary" onClick={() => void ws().openFolder()}><FolderOpen size={15} /> {S.openFolder}</button>
      </div>
    );
  }

  return (
    <div className="panel-scroll">
      <div className="list-heading">Documents</div>
      <ul className="plain-list">
        {repo.docxFiles.map((path) => {
          const { name, dir } = splitPath(path);
          return (
            <li key={path}>
              <button className={`row${path === file ? " active" : ""}`} onClick={() => void ws().readDocument(path)} title={`Open ${path}`}>
                <FileText size={15} className="row-icon" />
                <span className="row-main">{name}</span>
                {dir && <span className="row-dim">{dir}</span>}
              </button>
            </li>
          );
        })}
      </ul>

      {file && versions.length > 0 && (
        <>
          <div className="list-heading">Versions</div>
          <ol className="timeline">
            {versions.map((version) => {
              const key = versionKey(version);
              const isFrom = key === oldKey;
              const isTo = key === newKey;
              return (
                <li key={key} className={`version${isFrom || isTo ? " in-range" : ""}`}>
                  <span className={`dot ${version.kind}`} />
                  <button className="version-body version-open" onClick={() => ws().readVersion(key)} title="Read this version">
                    <div className="version-title">
                      {version.kind === "workdir" ? (version.dirty ? "Working copy (unsaved changes)" : "Working copy") : version.summary}
                    </div>
                    <div className="version-meta">
                      {version.tags.map((tag) => <span key={tag} className="chip tag">{tag}</span>)}
                      {version.kind === "commit" && <code>{version.shortId}</code>}
                      {version.author && <span>{version.author}</span>}
                      <span>{relativeTime(version.time)}</span>
                    </div>
                  </button>
                  <div className="version-pick">
                    <button className={isFrom ? "pick active" : "pick"} onClick={() => ws().setOldKey(key)} aria-pressed={isFrom}>From</button>
                    <button className={isTo ? "pick active" : "pick"} onClick={() => ws().setNewKey(key)} aria-pressed={isTo}>To</button>
                  </div>
                </li>
              );
            })}
          </ol>
        </>
      )}
    </div>
  );
}
