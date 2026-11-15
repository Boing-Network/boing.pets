import { useEffect, useId, useState } from "react";
import { MINT_BATCH_MAX, mintPresets } from "../content/gathering";
import { itemIconSvg } from "../ui/itemIcons";
import {
  GATHER_COPY,
  gatherAct,
  gatherMint,
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
  onMint,
  onClose,
}: {
  mode: "quarry" | "line" | "plot" | "sweep" | "bank";
  status: GatherStatus | null;
  busy: boolean;
  notice: string;
  onWork: () => void;
  onStop: () => void;
  onBank: () => void;
  onMint: (itemId: string, qty: number) => void;
  onClose: () => void;
}) {
  const titleId = useId();
  const itemSelectId = useId();
  const customId = useId();
  const [itemId, setItemId] = useState("");
  const [custom, setCustom] = useState("");
  const skill = status?.skill;
  const pack = status?.pack;
  const session = status?.session;
  const training = mode !== "bank";
  const running = session?.status === "running";
  const depleted = session?.status === "depleted";
  const packed = (pack?.units ?? 0) >= (pack?.cap ?? 28);
  const prompt = status?.prompt;
  const line = packed
    ? GATHER_COPY.packed
    : depleted
      ? (prompt?.depleted ?? GATHER_COPY.depleted)
      : running
        ? (prompt?.working ?? GATHER_COPY.working)
        : (prompt?.idle ?? "Hit the face. It dies on its own.");
  const mintOn = status?.mintEnabled === true;
  const bank = status?.bank ?? [];
  const selected = bank.some((row) => row.itemId === itemId)
    ? itemId
    : (bank[0]?.itemId ?? "");
  const selectedQty = bank.find((row) => row.itemId === selected)?.qty ?? 0;
  const presets = mintPresets(mintOn ? selectedQty : 0);
  const customQty = Number(custom);
  const customOk =
    Number.isInteger(customQty) &&
    customQty >= 1 &&
    customQty <= selectedQty &&
    customQty <= MINT_BATCH_MAX;
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
            {mode === "bank"
              ? "BLOCK VAULT"
              : (skill?.name ?? mode).toUpperCase()}
          </p>
          <h2 id={titleId}>
            {mode === "bank" ? "Bank the pack" : `Train ${skill?.name ?? mode}`}
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
        <div
          className="gather-xp"
          aria-label={`${skill.name ?? "Skill"} level ${skill.level}`}
        >
          <div className="gather-xp-label">
            <strong>
              {(skill.name ?? "SKILL").toUpperCase()} {skill.level}
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
        {training && status?.nodes?.length
          ? ` · ${status.nodes.map((node) => node.name).join(", ")}`
          : ""}
      </p>
      <div className="gather-actions">
        {training ? (
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
              {depleted
                ? (prompt?.again ?? "Hit it again")
                : (prompt?.act ?? "Work the face")}
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
        <div className="gather-mint" aria-disabled={mintOn ? "false" : "true"}>
          <p className="eyebrow">MINT</p>
          <p className="small">
            {mintOn
              ? "Only minted items can be listed. Pick a banked stack."
              : `${GATHER_COPY.mintClosed} Banked stacks stay off-chain.`}
          </p>
          {mintOn ? (
            <label htmlFor={itemSelectId}>
              Banked item
              <select
                id={itemSelectId}
                value={selected}
                disabled={busy || !bank.length}
                onChange={(event) => setItemId(event.target.value)}
              >
                {bank.length ? (
                  bank.map((item) => (
                    <option key={item.itemId} value={item.itemId}>
                      {item.name} × {item.qty}
                    </option>
                  ))
                ) : (
                  <option value="">Nothing banked to mint</option>
                )}
              </select>
            </label>
          ) : null}
          <div className="gather-mint-presets">
            {presets.map((preset) => (
              <button
                key={preset.qty}
                type="button"
                disabled={!mintOn || busy || !selected || !preset.enabled}
                title={
                  mintOn
                    ? preset.enabled
                      ? `Mint ${preset.qty.toLocaleString()}`
                      : "Larger than the banked stack"
                    : GATHER_COPY.mintClosed
                }
                onClick={() => onMint(selected, preset.qty)}
              >
                {preset.qty.toLocaleString()}
              </button>
            ))}
          </div>
          {mintOn ? (
            <label htmlFor={customId}>
              Custom amount
              <input
                id={customId}
                type="number"
                min={1}
                max={Math.min(MINT_BATCH_MAX, Math.max(selectedQty, 1))}
                inputMode="numeric"
                value={custom}
                disabled={busy || !selected}
                onChange={(event) => setCustom(event.target.value)}
              />
            </label>
          ) : null}
          {mintOn ? (
            <button
              type="button"
              disabled={!customOk || busy || !selected}
              onClick={() => onMint(selected, customQty)}
            >
              Mint {customOk ? customQty.toLocaleString() : "custom"}
            </button>
          ) : null}
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
  mode: "quarry" | "line" | "plot" | "sweep" | "bank";
  onClose: () => void;
  onStatus?: (status: GatherStatus) => void;
}) {
  const [status, setStatus] = useState<GatherStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (!app.owner) return;
    let dead = false;
    void gatherStatus(app.owner, mode === "bank" ? undefined : mode)
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
      void gatherAct("/api/gather/settle", app.owner, status.session?.skill)
        .then((next) => {
          setStatus(next);
          onStatus?.(next);
        })
        .catch(() => undefined);
    }, tick);
    return () => window.clearInterval(id);
  }, [onStatus, status?.session?.status, status?.session?.tickMs]);

  async function mint(itemId: string, qty: number) {
    if (!app.owner || busy) return;
    setBusy(true);
    setNotice("");
    try {
      const next = await gatherMint(
        app.owner,
        itemId,
        qty,
        crypto.randomUUID(),
      );
      setStatus(next);
      onStatus?.(next);
      const state = next.mint?.status;
      setNotice(
        state === "minted"
          ? "Minted. That stack can be listed."
          : state === "failed"
            ? "Mint failed. The stack is back in the bank."
            : "Mint submitted. It can be listed when the receipt lands.",
      );
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Mint failed.");
    } finally {
      setBusy(false);
    }
  }

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
      const next = await gatherAct(
        path,
        app.owner,
        mode === "bank" ? undefined : mode,
      );
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
      onMint={(itemId, qty) => void mint(itemId, qty)}
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
            {(status.skill.name ?? "QUARRY").toUpperCase()} {status.skill.level}
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
