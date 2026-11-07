// "Customize layout": choose, for every panel, whether it lives on the left, the right, the bottom, or stays hidden.
// (You can also still drag any tab anywhere; this is the explicit way.)

import { PANEL_TITLES, setPanelSide, useLayout, type PanelId, type Side } from "../../app/layout";

const SIDES: [Side, string][] = [["left", "Left"], ["right", "Right"], ["bottom", "Bottom"], ["off", "Hidden"]];
const PANELS = (Object.keys(PANEL_TITLES) as PanelId[]).filter((id) => id !== "redline" && id !== "textDiff");

export function LayoutDialog() {
  const open = useLayout((s) => s.customizeOpen);
  const sides = useLayout((s) => s.sides);
  const visible = useLayout((s) => s.visibleIds);
  const close = () => useLayout.getState().setCustomizeOpen(false);
  if (!open) return null;

  return (
    <div className="scrim" onMouseDown={close}>
      <div className="dialog layout-dialog" role="dialog" aria-modal="true" aria-label="Customize layout" onMouseDown={(e) => e.stopPropagation()} onKeyDown={(e) => e.key === "Escape" && close()}>
        <h2>Customize layout</h2>
        <p>Choose where each panel lives. The page is always in the middle. Panels on the same side share one tab group.</p>
        <div className="layout-table" role="table">
          <div className="layout-row head" role="row"><span /> {SIDES.map(([, label]) => <span key={label}>{label}</span>)}</div>
          {PANELS.map((id) => {
            const current: Side = sides[id] === "off" && visible.includes(id) ? "left" : sides[id];
            return (
              <div className="layout-row" role="row" key={id}>
                <span className="layout-name">{PANEL_TITLES[id]}</span>
                {SIDES.map(([side, label]) => (
                  <label key={side} className="layout-choice" title={`${PANEL_TITLES[id]}: ${label}`}>
                    <input type="radio" name={`side-${id}`} checked={current === side} onChange={() => setPanelSide(id, side)} aria-label={`${PANEL_TITLES[id]} ${label}`} />
                  </label>
                ))}
              </div>
            );
          })}
        </div>
        <div className="dialog-actions"><button className="primary" onClick={close}>Done</button></div>
      </div>
    </div>
  );
}
