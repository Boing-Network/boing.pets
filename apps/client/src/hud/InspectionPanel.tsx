import { useEffect, useState } from "react";
import {
  CreatureStatus,
  type CreatureView,
  type FamilyQueryResult,
  type RelationshipView,
} from "@boing-pets/contract";
import type { IpcClient } from "../api/ipc";
import { speciesLabel } from "../view/species-skins";
import { useUiStore } from "../state/uiStore";
import { useWorldViewStore } from "../state/worldViewStore";
import { topMemories } from "./topMemories";
import "./inspection.css";

type Props = {
  ipc: IpcClient;
};

function needRows(creature: CreatureView): Array<[string, number]> {
  return [
    ["hunger", creature.needs.hunger],
    ["thirst", creature.needs.thirst],
    ["fatigue", creature.needs.fatigue],
    ["discomfort", creature.needs.discomfort],
    ["unsafety", creature.needs.unsafety],
    ["loneliness", creature.needs.loneliness],
  ];
}

function geneRows(creature: CreatureView): Array<[string, number]> {
  return [
    ["strength", creature.genes.strength],
    ["speed", creature.genes.speed],
    ["intelligence", creature.genes.intelligence],
    ["curiosity", creature.genes.curiosity],
    ["sociability", creature.genes.sociability],
  ];
}

function traitRows(creature: CreatureView): Array<[string, number]> {
  return [
    ["curiosity", creature.personality.curiosity],
    ["aggression", creature.personality.aggression],
    ["loyalty", creature.personality.loyalty],
    ["sociability", creature.personality.sociability],
    ["bravery", creature.personality.bravery],
    ["risk taking", creature.personality.riskTaking],
  ];
}

function pairOtherId(rel: RelationshipView, selfId: number): number {
  return rel.creatureAId === selfId ? rel.creatureBId : rel.creatureAId;
}

function StatList({ rows }: { rows: Array<[string, number]> }) {
  return (
    <ul className="inspect-stat-list">
      {rows.map(([label, value]) => (
        <li key={label}>
          <span>{label}</span>
          <strong>{value}</strong>
        </li>
      ))}
    </ul>
  );
}

export function InspectionPanel({ ipc }: Props) {
  const selectedCreatureId = useUiStore((s) => s.selectedCreatureId);
  const selectCreature = useUiStore((s) => s.selectCreature);
  const view = useWorldViewStore((s) => s.view);
  const [family, setFamily] = useState<FamilyQueryResult | null>(null);
  const [familyError, setFamilyError] = useState<string | null>(null);

  const creature =
    view?.creatures.find((row) => row.id === selectedCreatureId) ?? null;

  useEffect(() => {
    if (selectedCreatureId == null) {
      setFamily(null);
      setFamilyError(null);
      return;
    }
    let cancelled = false;
    setFamily(null);
    setFamilyError(null);
    void ipc
      .query({
        message: "query.family",
        body: { creatureId: selectedCreatureId },
      })
      .then((result) => {
        if (cancelled) return;
        if (result.message !== "query.family") {
          setFamilyError("unexpected family response");
          return;
        }
        setFamily(result.body);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setFamilyError(error instanceof Error ? error.message : "query failed");
      });
    return () => {
      cancelled = true;
    };
  }, [ipc, selectedCreatureId]);

  const living =
    view?.creatures.filter((row) => row.status === CreatureStatus.ALIVE) ?? [];

  if (selectedCreatureId == null || !creature) {
    return (
      <aside className="inspect-panel inspect-panel--empty" aria-live="polite">
        <p className="inspect-hint">Select a creature to inspect.</p>
        {living.length > 0 ? (
          <ul className="inspect-picker">
            {living.map((row) => (
              <li key={row.id}>
                <button
                  type="button"
                  className="inspect-picker-btn"
                  title={speciesLabel(row.speciesId)}
                  onClick={() => selectCreature(row.id)}
                >
                  {row.name}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </aside>
    );
  }

  const memories = topMemories(creature.memories, 5);
  const pairs = creature.relationships;

  return (
    <aside className="inspect-panel" aria-label="Creature inspection">
      <header className="inspect-header">
        <div>
          <h2 className="inspect-name">{creature.name}</h2>
          <p className="inspect-sub">
            {speciesLabel(creature.speciesId)} · gen{" "}
            {creature.family.generation} · {creature.gender.toLowerCase()} ·{" "}
            {creature.status === CreatureStatus.ALIVE ? "alive" : "dead"} · age{" "}
            {creature.ageDays}d
          </p>
        </div>
        <button
          type="button"
          className="inspect-close"
          onClick={() => selectCreature(null)}
        >
          Close
        </button>
      </header>

      {living.length > 1 ? (
        <ul
          className="inspect-picker inspect-picker--compact"
          aria-label="Switch creature"
        >
          {living.map((row) => (
            <li key={row.id}>
              <button
                type="button"
                className={
                  row.id === creature.id
                    ? "inspect-picker-btn inspect-picker-btn--active"
                    : "inspect-picker-btn"
                }
                onClick={() => selectCreature(row.id)}
              >
                {row.name}
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <section className="inspect-section">
        <h3>Goal</h3>
        <p className="inspect-goal">{creature.currentGoal}</p>
      </section>

      <section className="inspect-section">
        <h3>Needs</h3>
        <StatList rows={needRows(creature)} />
      </section>

      <section className="inspect-section">
        <h3>Genes</h3>
        <StatList rows={geneRows(creature)} />
      </section>

      <section className="inspect-section">
        <h3>Traits</h3>
        <StatList rows={traitRows(creature)} />
      </section>

      <section className="inspect-section">
        <h3>Top memories</h3>
        {memories.length === 0 ? (
          <p className="inspect-empty">None yet.</p>
        ) : (
          <ul className="inspect-memory-list">
            {memories.map((memory) => (
              <li key={memory.id}>
                <span>{memory.kind}</span>
                <strong>str {memory.strength}</strong>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="inspect-section">
        <h3>Pairs</h3>
        {pairs.length === 0 ? (
          <p className="inspect-empty">No pairs.</p>
        ) : (
          <ul className="inspect-pair-list">
            {pairs.map((rel) => (
              <li key={rel.id}>
                <span>#{pairOtherId(rel, creature.id)}</span>
                <span className="inspect-labels">
                  {rel.labels.length > 0 ? rel.labels.join(", ") : "unlabeled"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="inspect-section">
        <h3>Family</h3>
        {familyError ? (
          <p className="inspect-empty">{familyError}</p>
        ) : family == null ? (
          <p className="inspect-empty">Loading family…</p>
        ) : (
          <div className="inspect-family">
            <p>
              mother{" "}
              {creature.family.motherId == null
                ? "—"
                : `#${creature.family.motherId}`}
              {" · "}
              father{" "}
              {creature.family.fatherId == null
                ? "—"
                : `#${creature.family.fatherId}`}
            </p>
            <ul className="inspect-ancestor-list">
              {family.ancestors.length === 0 ? (
                <li>No ancestors (founder).</li>
              ) : (
                family.ancestors.map(({ creature: ancestor, depth }) => (
                  <li key={`${ancestor.id}-${depth}`}>
                    d{depth} {ancestor.name}{" "}
                    <em>
                      {ancestor.status === CreatureStatus.DEAD
                        ? "dead"
                        : "alive"}
                    </em>
                  </li>
                ))
              )}
            </ul>
          </div>
        )}
      </section>
    </aside>
  );
}
