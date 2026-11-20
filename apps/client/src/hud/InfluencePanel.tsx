import { useState } from "react";
import { InfluenceKind } from "@boing-pets/contract";
import type { IpcClient } from "../api/ipc";
import { useUiStore } from "../state/uiStore";
import { useWorldViewStore } from "../state/worldViewStore";
import { ItemsSection } from "./ItemsSection";

type Props = {
  ipc: IpcClient;
};

export function InfluencePanel({ ipc }: Props) {
  const view = useWorldViewStore((s) => s.view);
  const selectedCreatureId = useUiStore((s) => s.selectedCreatureId);
  const [creatureName, setCreatureName] = useState("");
  const [lineageName, setLineageName] = useState("");
  const [territoryId, setTerritoryId] = useState<number | "">("");

  const creature =
    view?.creatures.find((row) => row.id === selectedCreatureId) ?? null;
  const territories = view?.territories ?? [];
  const effectiveTerritoryId =
    territoryId === ""
      ? (creature?.territoryId ?? territories[0]?.id ?? null)
      : territoryId;

  if (!view) return null;

  return (
    <aside className="influence-panel" aria-label="Player influences">
      <h2 className="influence-title">Influences</h2>
      <p className="influence-hint">
        3 influences per day (gathering and using items count). Selected
        creature and territory set the targets.
      </p>

      <div className="influence-row">
        <input
          className="influence-input"
          type="text"
          value={creatureName}
          placeholder={creature ? `Rename ${creature.name}` : "Creature name"}
          disabled={creature == null}
          onChange={(event) => setCreatureName(event.target.value)}
          aria-label="Creature name"
        />
        <button
          type="button"
          className="influence-btn"
          disabled={creature == null || creatureName.trim().length === 0}
          onClick={() => {
            if (creature == null) return;
            const name = creatureName.trim();
            if (!name) return;
            ipc.send({
              message: "influence.submit",
              body: {
                kind: InfluenceKind.NAME_CREATURE,
                payload: { creatureId: creature.id, name },
              },
            });
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
          onChange={(event) => setLineageName(event.target.value)}
          aria-label="Lineage name"
        />
        <button
          type="button"
          className="influence-btn"
          disabled={creature == null || lineageName.trim().length === 0}
          onClick={() => {
            if (creature == null) return;
            const name = lineageName.trim();
            if (!name) return;
            ipc.send({
              message: "influence.submit",
              body: {
                kind: InfluenceKind.NAME_LINEAGE,
                payload: { lineageId: creature.family.lineageId, name },
              },
            });
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
          onClick={() => {
            if (creature == null) return;
            ipc.send({
              message: "influence.submit",
              body: {
                kind: InfluenceKind.FAVOR_BLOODLINE,
                payload: { lineageId: creature.family.lineageId },
              },
            });
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
            ipc.send({
              message: "influence.submit",
              body: {
                kind: InfluenceKind.ENRICH_TERRITORY,
                payload: { territoryId: effectiveTerritoryId },
              },
            });
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
            ipc.send({
              message: "influence.submit",
              body: {
                kind: InfluenceKind.CALM_TERRITORY,
                payload: { territoryId: effectiveTerritoryId },
              },
            });
          }}
        >
          Calm
        </button>
      </div>

      <ItemsSection
        ipc={ipc}
        territory={
          territories.find((row) => row.id === effectiveTerritoryId) ?? null
        }
        lineageId={creature?.family.lineageId ?? null}
      />
    </aside>
  );
}
