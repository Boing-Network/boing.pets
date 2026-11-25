import { useEffect, useMemo, useRef, useState } from "react";
import {
  CreatureStatus,
  InfluenceKind,
  type CreatureView,
  type FamilyQueryResult,
  type RelationshipView,
  type WorldEventView,
} from "@boing-pets/contract";
import { creatureActivity, tickClock } from "./activity";
import type { IpcClient } from "../api/ipc";
import { speciesLabel } from "../view/species-skins";
import { useUiStore } from "../state/uiStore";
import { useWorldViewStore } from "../state/worldViewStore";
import { topMemories } from "./topMemories";
import { CreatureFinder } from "./CreatureFinder";
import { creatureCondition, healthLevel } from "./condition";
import { actionLabel, goalLabel, memoryLabel, memoryStrength } from "./labels";
import { needLevel, type NeedName } from "./needs";
import { PanelBar, usePanel } from "./PanelBar";
import "./inspection.css";

type Props = {
  ipc: IpcClient;
};

function needRows(creature: CreatureView): Array<[NeedName, number]> {
  return [
    ["hunger", creature.needs.hunger],
    ["thirst", creature.needs.thirst],
    ["fatigue", creature.needs.fatigue],
    ["discomfort", creature.needs.discomfort],
    ["unsafety", creature.needs.unsafety],
    ["loneliness", creature.needs.loneliness],
  ];
}

/** Needs as a word and a meter; the raw 0–1000 value is the tooltip. */
function NeedMeters({ rows }: { rows: Array<[NeedName, number]> }) {
  return (
    <ul className="inspect-need-list">
      {rows.map(([name, value]) => {
        const level = needLevel(name, value);
        return (
          <li key={name} title={`${name} ${value} / 1000`}>
            <span className="inspect-need-name">{name}</span>
            <span
              className={`inspect-need-bar inspect-need-bar--${level.tone}`}
              role="meter"
              aria-label={name}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={level.percent}
              aria-valuetext={level.label}
            >
              <span style={{ width: `${Math.max(3, level.percent)}%` }} />
            </span>
            <strong className="inspect-need-label">{level.label}</strong>
          </li>
        );
      })}
    </ul>
  );
}

/** Health reads the other way round from needs: a fuller bar is better. */
function HealthMeter({ health }: { health: number }) {
  const level = healthLevel(health);
  return (
    <ul className="inspect-need-list inspect-health">
      <li title={`health ${health} / 1000`}>
        <span className="inspect-need-name">health</span>
        <span
          className={`inspect-need-bar inspect-need-bar--${level.tone} inspect-need-bar--health`}
          role="meter"
          aria-label="health"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={level.percent}
          aria-valuetext={level.label}
        >
          <span style={{ width: `${Math.max(3, level.percent)}%` }} />
        </span>
        <strong className="inspect-need-label">{level.label}</strong>
      </li>
    </ul>
  );
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

/** A 0-1000 stat as a meter with its number. */
function StatList({ rows }: { rows: Array<[string, number]> }) {
  return (
    <ul className="inspect-stat-list">
      {rows.map(([label, value]) => (
        <li key={label}>
          <span className="inspect-need-name">{label}</span>
          <span
            className="inspect-need-bar inspect-stat-bar"
            aria-hidden="true"
          >
            <span
              style={{ width: `${Math.max(3, Math.min(100, value / 10))}%` }}
            />
          </span>
          <strong>{value}</strong>
        </li>
      ))}
    </ul>
  );
}

type NameEditorProps = {
  /** What is being named, for labels: "creature" or "lineage". */
  what: string;
  current: string;
  onSave: (name: string) => void;
};

/** A "Rename" button that turns into a small form in place. */
function NameEditor({ what, current, onSave }: NameEditorProps) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  if (!editing) {
    return (
      <button
        type="button"
        className="inspect-rename"
        title={`Give this ${what} a new name`}
        onClick={() => {
          setValue("");
          setEditing(true);
        }}
      >
        Rename
      </button>
    );
  }
  const name = value.trim();
  return (
    <form
      className="inspect-rename-form"
      onSubmit={(event) => {
        event.preventDefault();
        if (name === "") return;
        onSave(name);
        setEditing(false);
      }}
    >
      <input
        className="finder-search"
        type="text"
        value={value}
        maxLength={40}
        autoFocus
        placeholder={current}
        aria-label={`New ${what} name`}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.stopPropagation();
            setEditing(false);
          }
        }}
      />
      <button type="submit" className="inspect-rename" disabled={name === ""}>
        Save
      </button>
      <button
        type="button"
        className="inspect-rename"
        onClick={() => setEditing(false)}
      >
        Cancel
      </button>
    </form>
  );
}

type InspectTab = "now" | "nature" | "bonds";

const TABS: readonly { id: InspectTab; title: string }[] = [
  { id: "now", title: "Now" },
  { id: "nature", title: "Nature" },
  { id: "bonds", title: "Bonds" },
];

export function InspectionPanel({ ipc }: Props) {
  const selectedCreatureId = useUiStore((s) => s.selectedCreatureId);
  const selectCreature = useUiStore((s) => s.selectCreature);
  const view = useWorldViewStore((s) => s.view);
  const [family, setFamily] = useState<FamilyQueryResult | null>(null);
  const [familyError, setFamilyError] = useState<string | null>(null);
  const { collapsed, toggle } = usePanel("inspect");
  const [tab, setTab] = useState<InspectTab>("now");
  const [notice, setNotice] = useState("");
  const foldClass = collapsed ? " hud-panel--collapsed" : "";

  const creature =
    view?.creatures.find((row) => row.id === selectedCreatureId) ?? null;
  // The "Renaming…" line goes once the new name has arrived.
  const lineageName =
    view?.lineages.find((row) => row.id === creature?.family.lineageId)?.name ??
    null;
  useEffect(
    () => setNotice(""),
    [selectedCreatureId, creature?.name, lineageName],
  );
  // A refused rename (not the owner, or renamed this month) says why.
  const renameSentAt = useRef(0);
  const lastNotice = useWorldViewStore((s) => s.lastNotice);
  useEffect(() => {
    if (lastNotice == null || renameSentAt.current === 0) return;
    if (lastNotice.atMs < renameSentAt.current) return;
    renameSentAt.current = 0;
    const text = lastNotice.detail;
    setNotice(text.charAt(0).toUpperCase() + text.slice(1) + ".");
  }, [lastNotice]);

  // Item activity: durable history (query.events) plus live events.
  const itemLog = useWorldViewStore((s) => s.itemLog.entries);
  const [history, setHistory] = useState<WorldEventView[]>([]);
  const worldId = view?.world.id ?? null;
  const lastTick = view?.world.lastTick ?? 0;
  const ticksPerDay = 144;
  const historyBucket = Math.floor(lastTick / 36);
  useEffect(() => {
    if (selectedCreatureId == null || worldId == null) {
      setHistory([]);
      return;
    }
    let cancelled = false;
    const toTick = Math.max(0, historyBucket * 36 + 36);
    void ipc
      .query({
        message: "query.events",
        body: {
          worldId,
          fromTick: Math.max(0, toTick - 2 * ticksPerDay),
          toTick,
          limit: 500,
        },
      })
      .then((result) => {
        if (cancelled || result.message !== "query.events") return;
        setHistory(result.body.events);
      })
      .catch(() => {
        // Older hosts or a busy writer: live events still show.
      });
    return () => {
      cancelled = true;
    };
  }, [ipc, selectedCreatureId, worldId, historyBucket]);
  const activity = useMemo(() => {
    if (selectedCreatureId == null) return [];
    const byId = new Map<number, WorldEventView>();
    for (const event of history) byId.set(event.id, event);
    for (const event of itemLog) byId.set(event.id, event);
    for (const event of view?.events ?? []) byId.set(event.id, event);
    return creatureActivity(byId.values(), selectedCreatureId);
  }, [history, itemLog, view?.events, selectedCreatureId]);

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
      <aside
        className={`inspect-panel inspect-panel--empty hud-panel${foldClass}`}
        aria-live="polite"
      >
        <PanelBar
          title="Inspector"
          name="Inspector"
          bodyId="inspect-body"
          collapsed={collapsed}
          onToggle={toggle}
        />
        <div id="inspect-body" className="panel-body" hidden={collapsed}>
          <p className="inspect-hint">
            Tap a creature in the world or pick one here to see how it is doing,
            rename it, or follow its family.
          </p>
          {living.length > 0 ? (
            <CreatureFinder
              creatures={living}
              selectedId={null}
              onSelect={selectCreature}
            />
          ) : null}
        </div>
      </aside>
    );
  }

  const nameOf = new Map<number, string>(
    (view?.creatures ?? []).map((row): [number, string] => [row.id, row.name]),
  );
  const labelFor = (id: number): string => nameOf.get(id) ?? `#${id}`;
  const memories = topMemories(creature.memories, 5);
  const alive = creature.status === CreatureStatus.ALIVE;
  const condition = creatureCondition(creature);
  const lineage =
    view?.lineages.find((row) => row.id === creature.family.lineageId) ?? null;
  const territory =
    view?.territories.find((row) => row.id === creature.territoryId) ?? null;
  const pairs = creature.relationships;

  return (
    <aside
      className={`inspect-panel hud-panel${foldClass}`}
      aria-label="Creature inspection"
    >
      {/* Collapsed, the bar is all that shows, so it names who is selected. */}
      <PanelBar
        title={collapsed ? `Inspector · ${creature.name}` : "Inspector"}
        name="Inspector"
        bodyId="inspect-body"
        collapsed={collapsed}
        onToggle={toggle}
      />
      <div id="inspect-body" className="panel-body" hidden={collapsed}>
        <button
          type="button"
          className="inspect-back"
          onClick={() => selectCreature(null)}
        >
          ← All creatures
        </button>
        <header className="inspect-header">
          <div className="inspect-title-row">
            <h2 className="inspect-name">{creature.name}</h2>
            {alive ? (
              <NameEditor
                what="creature"
                current={creature.name}
                onSave={(name) => {
                  ipc.send({
                    message: "influence.submit",
                    body: {
                      kind: InfluenceKind.NAME_CREATURE,
                      payload: { creatureId: creature.id, name },
                    },
                  });
                  renameSentAt.current = Date.now();
                  setNotice(`Renaming to ${name}…`);
                }}
              />
            ) : null}
          </div>
          <p className="inspect-sub">
            {speciesLabel(creature.speciesId)} · {creature.gender.toLowerCase()}{" "}
            · age {creature.ageDays}d · gen {creature.family.generation}
            {alive ? "" : " · dead"}
          </p>
          <dl className="inspect-facts">
            <div>
              <dt>Lineage</dt>
              <dd>
                <span>{lineage?.name ?? `#${creature.family.lineageId}`}</span>
                <NameEditor
                  what="lineage"
                  current={lineage?.name ?? "Lineage name"}
                  onSave={(name) => {
                    ipc.send({
                      message: "influence.submit",
                      body: {
                        kind: InfluenceKind.NAME_LINEAGE,
                        payload: { lineageId: creature.family.lineageId, name },
                      },
                    });
                    renameSentAt.current = Date.now();
                    setNotice(`Renaming the lineage to ${name}…`);
                  }}
                />
              </dd>
            </div>
            {territory == null ? null : (
              <div>
                <dt>Home</dt>
                <dd>{territory.name}</dd>
              </div>
            )}
            {lineage != null && lineage.playerFavor > 0 ? (
              <div>
                <dt>Favor</dt>
                <dd>{lineage.playerFavor}</dd>
              </div>
            ) : null}
          </dl>
          <p className="inspect-notice" role="status" aria-live="polite">
            {notice}
          </p>
        </header>

        <div className="inspect-tabs" role="tablist" aria-label="Details">
          {TABS.map((option) => (
            <button
              key={option.id}
              type="button"
              role="tab"
              aria-selected={tab === option.id}
              className="inspect-tab"
              onClick={() => setTab(option.id)}
            >
              {option.title}
            </button>
          ))}
        </div>

        {tab === "now" ? (
          <>
            <section className="inspect-section">
              <h3>Goal</h3>
              <p className="inspect-goal">{goalLabel(creature.currentGoal)}</p>
              {creature.currentAction != null && alive ? (
                <p className="inspect-doing">
                  Right now: {actionLabel(creature.currentAction).toLowerCase()}
                </p>
              ) : null}
            </section>

            <section className="inspect-section">
              <h3>Needs</h3>
              {alive && creature.health != null ? (
                <HealthMeter health={creature.health} />
              ) : null}
              <NeedMeters rows={needRows(creature)} />
              {condition.level > 0 ? (
                <p
                  className={`inspect-condition inspect-condition--${condition.level}`}
                  role="status"
                >
                  <strong>
                    {condition.level === 2 ? "In danger: " : "Needs help: "}
                    {condition.reasons.join(", ")}.
                  </strong>{" "}
                  {condition.advice}
                </p>
              ) : null}
            </section>

            <section className="inspect-section">
              <h3>Activity</h3>
              {activity.length === 0 ? (
                <p className="inspect-empty">
                  Nothing found, crafted or eaten lately.
                </p>
              ) : (
                <ul className="inspect-activity">
                  {activity.map((line) => (
                    <li key={line.id}>
                      <time>{tickClock(line.tick, ticksPerDay)}</time>
                      {line.text}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        ) : null}

        {tab === "nature" ? (
          <>
            <section className="inspect-section">
              <h3>Genes</h3>
              <StatList rows={geneRows(creature)} />
            </section>

            <section className="inspect-section">
              <h3>Traits</h3>
              <StatList rows={traitRows(creature)} />
            </section>
          </>
        ) : null}

        {tab === "bonds" ? (
          <>
            <section className="inspect-section">
              <h3>Top memories</h3>
              {memories.length === 0 ? (
                <p className="inspect-empty">None yet.</p>
              ) : (
                <ul className="inspect-memory-list">
                  {memories.map((memory) => {
                    const strength = memoryStrength(memory.strength);
                    // Only name a subject the view knows; a bare id says nothing.
                    const subject =
                      memory.subjectCreatureId == null
                        ? undefined
                        : nameOf.get(memory.subjectCreatureId);
                    return (
                      <li
                        key={memory.id}
                        title={`strength ${memory.strength} / 1000`}
                      >
                        <span className="inspect-memory-what">
                          {memoryLabel(memory.kind)}
                          {subject == null ? null : <em> · {subject}</em>}
                        </span>
                        <span
                          className="inspect-need-bar inspect-memory-bar"
                          role="meter"
                          aria-label="memory strength"
                          aria-valuemin={0}
                          aria-valuemax={100}
                          aria-valuenow={strength.percent}
                          aria-valuetext={strength.label}
                        >
                          <span
                            style={{
                              width: `${Math.max(3, strength.percent)}%`,
                            }}
                          />
                        </span>
                        <strong className="inspect-memory-label">
                          {strength.label}
                        </strong>
                      </li>
                    );
                  })}
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
                      <span>{labelFor(pairOtherId(rel, creature.id))}</span>
                      <span className="inspect-labels">
                        {rel.labels.length > 0
                          ? rel.labels.join(", ")
                          : "unlabeled"}
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
                      : labelFor(creature.family.motherId)}
                    {" · "}
                    father{" "}
                    {creature.family.fatherId == null
                      ? "—"
                      : labelFor(creature.family.fatherId)}
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
          </>
        ) : null}
      </div>
    </aside>
  );
}
