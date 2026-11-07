// Small messages in the corner. Errors stay until dismissed so they can be read and copied.

import { CheckCircle2, CircleAlert, Info, X } from "lucide-react";
import { useUi } from "../store/ui";

const ICONS = { info: Info, success: CheckCircle2, error: CircleAlert } as const;

export function Toasts() {
  const toasts = useUi((s) => s.toasts);
  const dismiss = useUi((s) => s.dismissToast);

  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((toast) => {
        const Icon = ICONS[toast.kind];
        return (
          <div key={toast.id} className={`toast ${toast.kind}`}>
            <Icon size={16} />
            <span className="toast-text">{toast.text}</span>
            <button className="icon-button" aria-label="Dismiss" onClick={() => dismiss(toast.id)}>
              <X size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
