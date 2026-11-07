// Ctrl+K: type a few letters, press Enter. Every action in the app is here.

import { Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useUi } from "../store/ui";
import { getCommands, type Command } from "./commands";

/** Letters of the query must appear in order; earlier and tighter matches rank higher. */
function score(title: string, query: string): number {
  if (!query) return 1;
  const text = title.toLowerCase();
  let position = 0;
  let total = 0;
  for (const letter of query.toLowerCase()) {
    const found = text.indexOf(letter, position);
    if (found === -1) return 0;
    total += found - position === 0 ? 3 : 1; // reward consecutive letters
    position = found + 1;
  }
  return total + 1 / (1 + text.length);
}

export function CommandPalette() {
  const open = useUi((s) => s.paletteOpen);
  const setOpen = useUi((s) => s.setPaletteOpen);
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  // Rebuild the list each time it opens so it reflects the current state.
  const commands = useMemo(() => (open ? getCommands() : []), [open]);
  const results = useMemo(
    () =>
      commands
        .map((command) => ({ command, rank: score(command.title, query) }))
        .filter((r) => r.rank > 0)
        .sort((a, b) => b.rank - a.rank)
        .map((r) => r.command),
    [commands, query],
  );

  useEffect(() => {
    if (open) {
      setQuery("");
      setIndex(0);
      window.setTimeout(() => input.current?.focus(), 0);
    }
  }, [open]);
  useEffect(() => setIndex(0), [query]);

  if (!open) return null;

  const run = (command: Command | undefined) => {
    if (!command) return;
    setOpen(false);
    void command.run();
  };

  return (
    <div className="scrim top" onMouseDown={() => setOpen(false)}>
      <div className="palette" role="dialog" aria-label="Command palette" onMouseDown={(e) => e.stopPropagation()}>
        <div className="palette-input">
          <Search size={16} />
          <input
            ref={input}
            value={query}
            placeholder="Type a command…"
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setOpen(false);
              else if (e.key === "ArrowDown") { e.preventDefault(); setIndex((i) => Math.min(i + 1, results.length - 1)); }
              else if (e.key === "ArrowUp") { e.preventDefault(); setIndex((i) => Math.max(i - 1, 0)); }
              else if (e.key === "Enter") run(results[index]);
            }}
          />
        </div>
        <ul role="listbox">
          {results.length === 0 && <li className="palette-empty">No matching command.</li>}
          {results.map((command, i) => (
            <li key={command.id} role="option" aria-selected={i === index}>
              <button className={i === index ? "active" : ""} onMouseEnter={() => setIndex(i)} onClick={() => run(command)}>
                <span>{command.title}</span>
                <span className="palette-group">{command.group}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
