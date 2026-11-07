// Renders the confirm / prompt dialog requested through useUi().confirm / prompt.

import { useEffect, useRef, useState } from "react";
import { useUi, type DialogRequest } from "../store/ui";

export function DialogHost() {
  const dialog = useUi((s) => s.dialog);
  if (!dialog) return null;
  return <DialogView key={dialogKey(dialog)} dialog={dialog} />;
}

let counter = 0;
const keys = new WeakMap<DialogRequest, number>();
function dialogKey(dialog: DialogRequest): number {
  if (!keys.has(dialog)) keys.set(dialog, ++counter);
  return keys.get(dialog)!;
}

function DialogView({ dialog }: { dialog: DialogRequest }) {
  const close = useUi((s) => s.closeDialog);
  const [values, setValues] = useState<Record<string, string>>(() =>
    dialog.type === "prompt" ? Object.fromEntries(dialog.fields.map((f) => [f.name, f.initial ?? ""])) : {},
  );
  const firstField = useRef<HTMLInputElement & HTMLTextAreaElement>(null);

  useEffect(() => {
    firstField.current?.focus();
  }, []);

  const cancel = () => {
    if (dialog.type === "confirm") dialog.resolve(false);
    else dialog.resolve(null);
    close();
  };

  const missingRequired = dialog.type === "prompt" && dialog.fields.some((f) => f.required && !values[f.name]?.trim());

  const accept = () => {
    if (dialog.type === "confirm") dialog.resolve(true);
    else {
      if (missingRequired) return;
      dialog.resolve(values);
    }
    close();
  };

  return (
    <div className="scrim" onMouseDown={cancel}>
      <div
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-label={dialog.title}
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "Escape") cancel();
          if (e.key === "Enter" && !e.shiftKey && (e.target as HTMLElement).tagName !== "TEXTAREA") accept();
        }}
      >
        <h2>{dialog.title}</h2>
        {dialog.type === "confirm" && <p>{dialog.message}</p>}
        {dialog.type === "prompt" && dialog.message && <p>{dialog.message}</p>}

        {dialog.type === "prompt" &&
          dialog.fields.map((field, i) =>
            field.kind === "checkbox" ? (
              <label key={field.name} className="check-row">
                <input
                  type="checkbox"
                  checked={values[field.name] === "true"}
                  onChange={(e) => setValues({ ...values, [field.name]: String(e.target.checked) })}
                />
                {field.label}
              </label>
            ) : (
              <label key={field.name} className="field-row">
                <span>{field.label}</span>
                {field.kind === "multiline" ? (
                  <textarea
                    ref={i === 0 ? (firstField as never) : undefined}
                    rows={3}
                    value={values[field.name]}
                    placeholder={field.placeholder}
                    onChange={(e) => setValues({ ...values, [field.name]: e.target.value })}
                  />
                ) : (
                  <input
                    ref={i === 0 ? firstField : undefined}
                    value={values[field.name]}
                    placeholder={field.placeholder}
                    onChange={(e) => setValues({ ...values, [field.name]: e.target.value })}
                  />
                )}
              </label>
            ),
          )}

        <div className="dialog-actions">
          <button onClick={cancel}>Cancel</button>
          <button
            className={dialog.type === "confirm" && dialog.danger ? "danger primary" : "primary"}
            disabled={missingRequired}
            onClick={accept}
            autoFocus={dialog.type === "confirm"}
          >
            {dialog.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
