import { useEffect, useId, useState } from "react";
import { mintPresets } from "../content/gathering";
import { itemIconSvg } from "../ui/itemIcons";
import {
  GATHER_COPY,
  gatherAct,
  gatherStatus,
  type GatherStatus,
} from "../ui/gatherClient";
import { app } from "../ui/appRuntime";

export function xpFill(status: GatherStatus): number {
  const skill = status.skill;
  if (!skill) return 0;
  const span = Math.max(1, skill.xpAtNext - skill.xpAtLevel);
  return Math.max(0, Math.min(1, (skill.xp - skill.xpAtLevel) / span));
}

export function GatherPanel({
  mode,
  status,
  busy,
  notice,
  onWork,
  onStop,
  onBank,
  onClose,
}: {
  mode: "quarry" | "bank";
  status: GatherStatus | null;
  busy: boolean;
  notice: string;
  onWork: () => void;
  onStop: () => void;
  onBank: () => void;
  onClose: () => void;
}) {
  const titleId = useId();
  const skill = status?.skill;
  const pack = status?.pack;
  const session = status?.session;
  const running = session?.status === "running";
  const depleted = session?.status === "depleted";
  const packed = (pack?.units ?? 0) >= (pack?.cap ?? 28);
  const line = packed
    ? GATHER_COPY.packed
    : depleted
      ? GATHER_COPY.depleted
      : running
        ? GATHER_COPY.working
        : "Hit the face. It dies on its own.";
  const presets = mintPresets(0);
  return (
    <div
      className="pasture-station-menu gather-panel"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <div className="pasture-station-menu-head">
        <div>
          <p className="eyebrow">
            {mode === "bank" ? "BLOCK VAULT" : "QUARRY"}
          </p>
          <h2 id={titleId}>
            {mode === "bank" ? "Bank the pack" : "Work the face"}
          </h2>
        </div>
        <button
          type="button"
          className="quiet pasture-station-close"
          onClick={onClose}
        >
          Close
        </button>
      </div>
      {skill ? (
        <div className="gather-xp" aria-label={`Quarry level ${skill.level}`}>
          <div className="gather-xp-label">
            <strong>
              QUARRY {skill.level}
              {skill.prestige > 0 ? `  P${skill.prestige}` : ""}
            </strong>
            <span>
              {skill.xp - skill.xpAtLevel} /{" "}
              {Math.max(1, skill.xpAtNext - skill.xpAtLevel)}
            </span>
          </div>
          <div className="gather-xp-bar">
            <span style={{ width: `${Math.round(xpFill(status!) * 100)}%` }} />
          </div>
          {skill.prestige > 0 ? (
            <p className="small">Prestige is a count. It opens nothing.</p>
          ) : null}
        </div>
      ) : (
        <p className="small">Connect, then hatch a character.</p>
      )}
      <p className="gather-line" role="status">
        {mode === "bank"
          ? "Drop the pack. Cred pays on the first 80 today."
          : line}
      </p>
      {notice ? <p className="gather-note">{notice}</p> : null}
      <ul className="gather-pack-list">
        {(pack?.items ?? []).map((item) => (
          <li key={item.itemId}>
            <span
              className="gather-icon"
              dangerouslySetInnerHTML={{ __html: itemIconSvg(item.itemId) }}
            />
            <span>{item.name}</span>
            <b>{item.qty}</b>
          </li>
        ))}
        {!pack?.items.length ? (
          <li className="gather-empty">Pack is empty.</li>
        ) : null}
      </ul>
      <p className="small">
        PACK {pack?.units ?? 0}/{pack?.cap ?? 28}
        {status?.cred
          ? ` · CRED ${status.cred.paidUnits}/${status.cred.cap} today`
          : ""}
        {status?.pickaxeTier ? ` · PICK T${status.pickaxeTier}` : ""}
      </p>
      <div className="gather-actions">
        {mode === "quarry" ? (
          running ? (
            <button type="button" disabled={busy} onClick={onStop}>
              Stop
            </button>
          ) : (
            <button
              type="button"
              disabled={busy || packed || !app.owner}
              onClick={onWork}
            >
              {depleted ? "Hit it again" : "Work the face"}
            </button>
          )
        ) : (
          <button
            type="button"
            disabled={busy || !pack?.units}
            onClick={onBank}
          >
            Bank
          </button>
        )}
      </div>
      {mode === "bank" ? (
        <div className="gather-mint" aria-disabled="true">
          <p className="eyebrow">MINT</p>
          <p className="small">
            {GATHER_COPY.mintClosed} Banked stacks stay off-chain.
          </p>
          <div className="gather-mint-presets">
            {presets.map((preset) => (
              <button
                key={preset.qty}
                type="button"
                disabled
                title={GATHER_COPY.mintClosed}
              >
                {preset.qty.toLocaleString()}
              </button>
            ))}
          </div>
          <p className="small">
            One item id is one leg. Amounts above the banked stack stay shut.
          </p>
        </div>
      ) : null}
    </div>
  );
}

export function PastureGatherMenu({
  mode,
  onClose,
  onStatus,
}: {
  mode: "quarry" | "bank";
  onClose: () => void;
  onStatus?: (status: GatherStatus) => void;
}) {
  const [status, setStatus] = useState<GatherStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (!app.owner) return;
    let dead = false;
    void gatherStatus(app.owner)
      .then((next) => {
        if (dead) return;
        setStatus(next);
        onStatus?.(next);
      })
      .catch((error: unknown) => {
        if (!dead)
          setNotice(
            error instanceof Error ? error.message : "Quarry is closed.",
          );
      });
    return () => {
      dead = true;
    };
  }, [mode, onStatus]);

  useEffect(() => {
    if (status?.session?.status !== "running") return;
    const tick = Math.max(2400, status.session.tickMs);
    const id = window.setInterval(() => {
      if (!app.owner) return;
      void gatherAct("/api/gather/settle", app.owner)
        .then((next) => {
          setStatus(next);
          onStatus?.(next);
        })
        .catch(() => undefined);
    }, tick);
    return () => window.clearInterval(id);
  }, [onStatus, status?.session?.status, status?.session?.tickMs]);

  async function run(
    path:
      | "/api/gather/start"
      | "/api/gather/settle"
      | "/api/gather/stop"
      | "/api/gather/bank",
  ) {
    if (!app.owner || busy) return;
    setBusy(true);
    setNotice("");
    try {
      const next = await gatherAct(path, app.owner);
      setStatus(next);
      onStatus?.(next);
      if (path === "/api/gather/bank") {
        setNotice(
          next.credGained
            ? `Banked. ${next.credGained} Cred.`
            : "Banked. No Cred on this drop.",
        );
      }
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "Could not reach the face.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <GatherPanel
      mode={mode}
      status={status}
      busy={busy}
      notice={notice}
      onWork={() => void run("/api/gather/start")}
      onStop={() => void run("/api/gather/stop")}
      onBank={() => void run("/api/gather/bank")}
      onClose={onClose}
    />
  );
}

export function GatherHud({
  status,
  onOpenPack,
}: {
  status: GatherStatus | null;
  onOpenPack: () => void;
}) {
  const [toasts, setToasts] = useState<string[]>([]);
  const levelKey = (status?.levelUps ?? []).map((row) => row.label).join("|");
  useEffect(() => {
    if (!levelKey) return;
    const labels = levelKey.split("|");
    setToasts(labels);
    const id = window.setTimeout(() => setToasts([]), 2200);
    return () => window.clearTimeout(id);
  }, [levelKey]);

  if (!status?.enabled || !status.skill) return null;
  const packed = (status.pack?.units ?? 0) >= (status.pack?.cap ?? 28);
  const depleted = status.session?.status === "depleted";
  return (
    <div className="gather-hud">
      <button type="button" className="gather-pack-chip" onClick={onOpenPack}>
        PACK {status.pack?.units ?? 0}/{status.pack?.cap ?? 28}
      </button>
      <div className="gather-xp gather-xp-hud">
        <div className="gather-xp-label">
          <strong>
            QUARRY {status.skill.level}
            {status.skill.prestige > 0 ? `  P${status.skill.prestige}` : ""}
          </strong>
        </div>
        <div className="gather-xp-bar" aria-hidden="true">
          <span style={{ width: `${Math.round(xpFill(status) * 100)}%` }} />
        </div>
      </div>
      {depleted ? (
        <p className="gather-alert" role="status">
          {GATHER_COPY.depleted}
        </p>
      ) : null}
      {packed ? (
        <p className="gather-alert" role="status">
          {GATHER_COPY.packed}
        </p>
      ) : null}
      <div className="gather-toasts" aria-live="polite">
        {toasts.map((label, index) => (
          <p key={`${label}-${index}`} className="gather-toast">
            {label}
          </p>
        ))}
      </div>
    </div>
  );
}
