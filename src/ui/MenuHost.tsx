// Renders the dropdown / context menu requested through useUi().openMenu.

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useUi } from "../store/ui";

export function MenuHost() {
  const menu = useUi((s) => s.menu);
  const close = useUi((s) => s.closeMenu);
  const ref = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ x: 0, y: 0 });

  // Keep the menu inside the window.
  useLayoutEffect(() => {
    if (!menu || !ref.current) return;
    const box = ref.current.getBoundingClientRect();
    setPosition({
      x: Math.max(8, Math.min(menu.x, window.innerWidth - box.width - 8)),
      y: Math.max(8, Math.min(menu.y, window.innerHeight - box.height - 8)),
    });
  }, [menu]);

  useEffect(() => {
    if (!menu) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    window.addEventListener("blur", close);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("blur", close);
    };
  }, [menu, close]);

  if (!menu) return null;
  return (
    <div className="menu-scrim" onMouseDown={close} onContextMenu={(e) => { e.preventDefault(); close(); }}>
      <div ref={ref} className="menu" style={{ left: position.x, top: position.y }} role="menu" onMouseDown={(e) => e.stopPropagation()}>
        {menu.items.map((item, i) => (
          <div key={i}>
            {item.separator && <div className="menu-separator" />}
            <button
              role="menuitem"
              className={item.danger ? "menu-item danger" : "menu-item"}
              disabled={item.disabled}
              onClick={() => {
                close();
                item.onSelect();
              }}
            >
              <span>{item.label}</span>
              {item.hint && <kbd>{item.hint}</kbd>}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
