// A plain log of what Inkdelta asked Git to do, and what Git answered.

import { useEffect, useRef } from "react";
import { useGit } from "../../store/git";

export function OutputPanel() {
  const log = useGit((s) => s.log);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [log.length]);

  if (log.length === 0) return <div className="empty-panel"><p className="muted">Git activity appears here.</p></div>;

  return (
    <div className="panel-scroll output">
      {log.map((entry) => (
        <div key={entry.id} className={`log-entry${entry.ok ? "" : " failed"}`}>
          <span className="log-time">{new Date(entry.time).toLocaleTimeString()}</span>
          <span className="log-label">{entry.label}</span>
          {entry.output && <pre>{entry.output}</pre>}
        </div>
      ))}
      <div ref={end} />
    </div>
  );
}
