// Appearance: pick a theme, an accent colour, and how the document is set. Everything applies instantly.

import { Check, Monitor } from "lucide-react";
import { ACCENTS, THEMES, useUi, type DocFont, type DocSize, type ThemeInfo } from "../../store/ui";

const FONTS: [DocFont, string][] = [["serif", "Serif"], ["sans", "Sans"], ["classic", "Classic"]];
const SIZES: [DocSize, string][] = [["s", "Small"], ["m", "Medium"], ["l", "Large"], ["xl", "Larger"]];

export function AppearanceDialog() {
  const open = useUi((s) => s.appearanceOpen);
  const appearance = useUi((s) => s.appearance);
  const setAppearance = useUi((s) => s.setAppearance);
  const close = () => useUi.getState().setAppearanceOpen(false);
  if (!open) return null;

  return (
    <div className="scrim" onMouseDown={close}>
      <div className="dialog appearance" role="dialog" aria-modal="true" aria-label="Appearance" onMouseDown={(e) => e.stopPropagation()} onKeyDown={(e) => e.key === "Escape" && close()}>
        <h2>Appearance</h2>

        <h3>Theme</h3>
        <div className="theme-grid" role="radiogroup" aria-label="Theme">
          <button role="radio" aria-checked={appearance.theme === "system"} className={`theme-card${appearance.theme === "system" ? " chosen" : ""}`} onClick={() => setAppearance({ theme: "system" })}>
            <span className="theme-preview system"><Monitor size={20} /></span>
            <span className="theme-name">Match system{appearance.theme === "system" && <Check size={13} />}</span>
          </button>
          {THEMES.map((theme) => (
            <ThemeCard key={theme.id} theme={theme} chosen={appearance.theme === theme.id} onPick={() => setAppearance({ theme: theme.id })} />
          ))}
        </div>

        <h3>Accent colour</h3>
        <div className="accent-row" role="radiogroup" aria-label="Accent colour">
          {ACCENTS.map((accent) => (
            <button
              key={accent.id}
              role="radio"
              aria-checked={appearance.accent === accent.id}
              aria-label={accent.label}
              title={accent.label}
              className={`accent-dot${appearance.accent === accent.id ? " chosen" : ""}`}
              style={{ background: accent.color }}
              onClick={() => setAppearance({ accent: accent.id })}
            >
              {appearance.accent === accent.id && <Check size={14} />}
            </button>
          ))}
        </div>

        <h3>Document</h3>
        <div className="doc-options">
          <span className="segmented" role="group" aria-label="Reading font">
            {FONTS.map(([id, label]) => (
              <button key={id} className={appearance.docFont === id ? "active" : ""} onClick={() => setAppearance({ docFont: id })}>{label}</button>
            ))}
          </span>
          <span className="segmented" role="group" aria-label="Text size">
            {SIZES.map(([id, label]) => (
              <button key={id} className={appearance.docSize === id ? "active" : ""} onClick={() => setAppearance({ docSize: id })}>{label}</button>
            ))}
          </span>
        </div>
        <p className="doc-sample">Pneumonia remains a significant global health concern, especially for susceptible groups.</p>

        <div className="dialog-actions">
          <button className="primary" onClick={close}>Done</button>
        </div>
      </div>
    </div>
  );
}

/** A miniature of the app in that theme's own colours. */
function ThemeCard({ theme, chosen, onPick }: { theme: ThemeInfo; chosen: boolean; onPick: () => void }) {
  const [window, pane, text] = theme.swatch;
  return (
    <button role="radio" aria-checked={chosen} className={`theme-card${chosen ? " chosen" : ""}`} onClick={onPick}>
      <span className="theme-preview" style={{ background: window }}>
        <span className="mini-pane" style={{ background: pane }}>
          <i style={{ background: text, width: "62%" }} />
          <i style={{ background: text, width: "42%", opacity: 0.45 }} />
          <i className="mini-accent" />
        </span>
      </span>
      <span className="theme-name">{theme.label}{chosen && <Check size={13} />}<small>{theme.mode}</small></span>
    </button>
  );
}
