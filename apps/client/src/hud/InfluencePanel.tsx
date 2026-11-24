import { useState } from "react";
import { InfluenceKind } from "@boing-pets/contract";
import type { IpcClient } from "../api/ipc";
import { useUiStore } from "../state/uiStore";
import { useWorldViewStore } from "../state/worldViewStore";
import { PanelBar, usePanel } from "./PanelBar";

type SubmitBody = Extract<
  Parameters<IpcClient["send"]>[0],
  { message: "influence.submit" }
>["body"];

type Props = {
  ipc: IpcClient;
};

export function InfluencePanel({ ipc }: Props) {
  const view = useWorldViewStore((s) => s.view);
  const selectedCreatureId = useUiStore((s) => s.selectedCreatureId);
  const [creatureName, setCreatureName] = useState("");
  const [lineageName, setLineageName] = useState("");
  const [territoryId, setTerritoryId] = useState<number | "">("");
  const [notice, setNotice] = useState<string | null>(null);
  const { collapsed, toggle } = usePanel("influence");
  const needCreature =
    "Select a creature first (list on the right or tap one).";

  const creature =
    view?.creatures.find((row) => row.id === selectedCreatureId) ?? null;
  const territories = view?.territories ?? [];
  const effectiveTerritoryId =
    territoryId === ""
      ? (creature?.territoryId ?? territories[0]?.id ?? null)
      : territoryId;

  if (!view) return null;

  /** Send an influence and say so; the host applies it on its next tick. */
  const submit = (body: SubmitBody, done: string) => {
    ipc.send({ message: "influence.submit", body });
    setNotice(done);
  };

  return (
    <aside
      className={`influence-panel hud-panel${collapsed ? " hud-panel--collapsed" : ""}`}
      aria-label="Player influences"
    >
      <PanelBar
        title="Influences"
        name="Influences"
        bodyId="influence-body"
        collapsed={collapsed}
        onToggle={toggle}
      />
      {/* Hidden, not unmounted: typed names and item choices survive a fold. */}
      <div id="influence-body" className="panel-body" hidden={collapsed}>
        <p className="influence-hint">
          You nudge, they decide. Up to 3 nudges per rolling day. The selected
          creature and territory are the targets.
        </p>
        {creature == null ? (
          <p className="influence-reason" role="note">
            {needCreature} Naming and bloodline actions need one.
          </p>
        ) : (
          <p className="influence-target">
            Target: <strong>{creature.name}</strong>
          </p>
        )}

        <div className="influence-row">
          <input
            className="influence-input"
            type="text"
            value={creatureName}
            placeholder={creature ? `Rename ${creature.name}` : "Creature name"}
            disabled={creature == null}
            title={creature == null ? needCreature : undefined}
            onChange={(event) => setCreatureName(event.target.value)}
            aria-label="Creature name"
          />
          <button
            type="button"
            className="influence-btn"
            disabled={creature == null || creatureName.trim().length === 0}
            title={
              creature == null
                ? needCreature
                : creatureName.trim().length === 0
                  ? "Type a name first."
                  : undefined
            }
            onClick={() => {
              if (creature == null) return;
              const name = creatureName.trim();
              if (!name) return;
              submit(
                {
                  kind: InfluenceKind.NAME_CREATURE,
                  payload: { creatureId: creature.id, name },
                },
                "Name sent. It appears on the creature shortly.",
              );
              setCreatureName("");
            }}
          >
            Name creature
          </button>
        </div>

        <div className="influence-row">
          <input
            className="influence-input"
            type="text"
            value={lineageName}
            placeholder={
              creature
                ? `Rename lineage #${creature.family.lineageId}`
                : "Lineage name"
            }
            disabled={creature == null}
            title={creature == null ? needCreature : undefined}
            onChange={(event) => setLineageName(event.target.value)}
            aria-label="Lineage name"
          />
          <button
            type="button"
            className="influence-btn"
            disabled={creature == null || lineageName.trim().length === 0}
            title={
              creature == null
                ? needCreature
                : lineageName.trim().length === 0
                  ? "Type a lineage name first."
                  : undefined
            }
            onClick={() => {
              if (creature == null) return;
              const name = lineageName.trim();
              if (!name) return;
              submit(
                {
                  kind: InfluenceKind.NAME_LINEAGE,
                  payload: { lineageId: creature.family.lineageId, name },
                },
                "Lineage name sent.",
              );
              setLineageName("");
            }}
          >
            Name lineage
          </button>
        </div>

        <div className="influence-row">
          <button
            type="button"
            className="influence-btn"
            disabled={creature == null}
            title={
              creature == null
                ? needCreature
                : "Boost this lineage's odds of surviving and breeding."
            }
            onClick={() => {
              if (creature == null) return;
              submit(
                {
                  kind: InfluenceKind.FAVOR_BLOODLINE,
                  payload: { lineageId: creature.family.lineageId },
                },
                "Bloodline favored. It fades over a few days.",
              );
            }}
          >
            Favor bloodline
          </button>
        </div>

        <div className="influence-row">
          <label className="influence-label" htmlFor="influence-territory">
            Territory
          </label>
          <select
            id="influence-territory"
            className="influence-select"
            value={effectiveTerritoryId ?? ""}
            onChange={(event) => {
              const next = Number(event.target.value);
              setTerritoryId(Number.isFinite(next) ? next : "");
            }}
          >
            {territories.map((territory) => (
              <option key={territory.id} value={territory.id}>
                {territory.name}
              </option>
            ))}
          </select>
        </div>

        <div className="influence-row influence-row--split">
          <button
            type="button"
            className="influence-btn"
            disabled={effectiveTerritoryId == null}
            onClick={() => {
              if (effectiveTerritoryId == null) return;
              submit(
                {
                  kind: InfluenceKind.ENRICH_TERRITORY,
                  payload: { territoryId: effectiveTerritoryId },
                },
                "Territory enriched: more food for a while.",
              );
            }}
          >
            Enrich
          </button>
          <button
            type="button"
            className="influence-btn"
            disabled={effectiveTerritoryId == null}
            onClick={() => {
              if (effectiveTerritoryId == null) return;
              submit(
                {
                  kind: InfluenceKind.CALM_TERRITORY,
                  payload: { territoryId: effectiveTerritoryId },
                },
                "Territory calmed: less danger for a while.",
              );
            }}
          >
            Calm
          </button>
        </div>

        <p className="influence-notice" role="status" aria-live="polite">
          {notice ?? ""}
        </p>
      </div>
    </aside>
  );
}
