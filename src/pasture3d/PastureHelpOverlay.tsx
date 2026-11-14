import { SHORTCUT_HELP } from "./keyboardShortcuts";

export function PastureHelpOverlay({
  open,
  touch,
  onClose,
}: {
  open: boolean;
  touch: boolean;
  onClose: () => void;
}) {
  if (!open) return null;
  return (
    <div
      className="pasture-help-overlay"
      data-hud="help"
      role="dialog"
      aria-label="Keyboard and touch shortcuts"
      aria-modal="true"
    >
      <div className="pasture-help-head">
        <h2>Shortcuts</h2>
        <button type="button" className="quiet" onClick={onClose}>
          Close
        </button>
      </div>
      <p className="pasture-help-lead">
        {touch
          ? "On a phone or tablet, use the on-screen buttons. Keys still work with a keyboard."
          : "Keys work anywhere on the pasture except when you are typing in chat."}
      </p>
      <table className="pasture-help-table">
        <thead>
          <tr>
            <th>Key</th>
            <th>Action</th>
            {touch ? <th>On a phone</th> : null}
          </tr>
        </thead>
        <tbody>
          {SHORTCUT_HELP.map((row) => (
            <tr key={row.key}>
              <th scope="row">
                <kbd>{row.key}</kbd>
              </th>
              <td>{row.action}</td>
              {touch ? <td>{row.touch}</td> : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function PastureHelpButton({
  open,
  onToggle,
}: {
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      className={open ? "is-open" : undefined}
      aria-label="Keyboard and touch shortcuts"
      aria-pressed={open}
      onClick={onToggle}
    >
      ?
    </button>
  );
}
