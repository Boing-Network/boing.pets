import {
  speciesKeyForSlug,
  type SpeciesCatalogRow,
} from "@boing-pets/contract";
import { previewSpeciesVoice } from "../audio/bind";
import { SiteNav } from "../hud/SiteNav";
import { bodyPlanName } from "../site/species-labels";
import {
  BESTIARY_INDEX_HREF,
  DIET_LABEL,
  GAIT_NAME,
  marketHrefForSpecies,
  territoryName,
  worldScaleForSpecies,
  type PoseMode,
} from "./bestiary-data";
import type { SpeciesLiveCounts } from "./bestiary-live";
import { BestiaryStage } from "./BestiaryStage";

const TRAITS: readonly {
  key:
    | "baseCuriosity"
    | "baseAggression"
    | "baseLoyalty"
    | "baseSociability"
    | "baseBravery"
    | "baseRiskTaking";
  label: string;
}[] = [
  { key: "baseCuriosity", label: "Curiosity" },
  { key: "baseAggression", label: "Aggression" },
  { key: "baseLoyalty", label: "Loyalty" },
  { key: "baseSociability", label: "Sociability" },
  { key: "baseBravery", label: "Bravery" },
  { key: "baseRiskTaking", label: "Risk taking" },
];

const GENES: readonly {
  key: keyof SpeciesCatalogRow["genes"];
  label: string;
}[] = [
  { key: "strength", label: "Strength" },
  { key: "speed", label: "Speed" },
  { key: "intelligence", label: "Intelligence" },
  { key: "curiosity", label: "Curiosity" },
  { key: "sociability", label: "Sociability" },
];

type Props = {
  row: SpeciesCatalogRow;
  pose: PoseMode;
  live?: SpeciesLiveCounts;
  onBack: () => void;
};

export function BestiaryDetail({ row, pose, live, onBack }: Props) {
  const key = speciesKeyForSlug(row.slug);
  const scale = worldScaleForSpecies(row.slug);
  const alsoIn = row.habitat.map((slug) => territoryName(slug));
  const needs = Object.entries(row.needs).filter(([, value]) => value !== 0);

  return (
    <div className="bestiary-page bestiary-detail-page">
      <header className="bestiary-top">
        <a className="brand" href="/">
          Living Pets
        </a>
        <SiteNav current="bestiary" />
      </header>
      <main className="bestiary-detail">
        <div className="bestiary-viewer">
          <BestiaryStage slug={row.slug} pose={pose} />
        </div>
        <section className="bestiary-stats" aria-labelledby="species-name">
          <a
            className="back"
            href={BESTIARY_INDEX_HREF}
            onClick={(event) => {
              if (
                event.metaKey ||
                event.ctrlKey ||
                event.shiftKey ||
                event.altKey ||
                event.button !== 0
              ) {
                return;
              }
              event.preventDefault();
              onBack();
            }}
          >
            ← All species
          </a>
          <h1 id="species-name">{row.displayName}</h1>
          <p className="lede">
            {DIET_LABEL[row.diet]} · {GAIT_NAME[row.gait]} ·{" "}
            {territoryName(row.home)}
          </p>
          <button
            type="button"
            className="call-btn"
            onClick={() => previewSpeciesVoice(row.id)}
          >
            Hear its call
          </button>
          {live ? (
            <p className="live-line">
              {live.living} living in the world
              {live.listed > 0 ? ` · ${live.listed} listed on the market` : ""}
            </p>
          ) : null}
          <dl className="facts">
            <Fact label="Diet" value={DIET_LABEL[row.diet]} />
            <Fact label="Movement" value={GAIT_NAME[row.gait]} />
            {key ? (
              <Fact label="Body plan" value={bodyPlanName(key.bodyPlan)} />
            ) : null}
            <Fact label="Home" value={territoryName(row.home)} />
            <Fact
              label="Also at ease in"
              value={alsoIn.length > 0 ? alsoIn.join(", ") : "Home only"}
            />
            <Fact label="Lifespan" value={`${row.baseLifespanDays} days`} />
            <Fact label="Maturity" value={`${row.maturityDays} days`} />
            <Fact label="Gestation" value={`${row.gestationDays} days`} />
            <Fact label="Juvenile" value={`${row.juvenileDays} days`} />
            <Fact label="In-world scale" value={scale.toFixed(2)} />
            <Fact label="Forage skill" value={`${row.forageSkill}‰`} />
            {needs.length > 0 ? (
              <Fact
                label="Needs drift"
                value={needs
                  .map(
                    ([name, value]) =>
                      `${name} ${value > 0 ? "+" : ""}${value}`,
                  )
                  .join(", ")}
              />
            ) : null}
            <div className="fact swatch-fact">
              <dt>Catalog color</dt>
              <dd>
                <span
                  className="swatch"
                  style={{ background: row.colorHex }}
                  title={row.colorHex}
                />
                {row.colorHex}
              </dd>
            </div>
          </dl>
          <h2>Traits</h2>
          <p className="hint">
            Base values from the catalog, on a 0–1000 scale.
          </p>
          <ul className="bars">
            {TRAITS.map(({ key: trait, label }) => (
              <Bar key={trait} label={label} value={row[trait]} />
            ))}
          </ul>
          <h2>Founder genes</h2>
          <p className="hint">
            Gene centres (0–1000). Founders roll a small spread around these.
          </p>
          <ul className="bars">
            {GENES.map(({ key: gene, label }) => (
              <Bar key={gene} label={label} value={row.genes[gene]} />
            ))}
          </ul>
          <div className="bestiary-links">
            <a className="cta" href={marketHrefForSpecies(row.slug)}>
              Marketplace listings
            </a>
            <a className="ghost" href="/world/">
              See them in the world
            </a>
          </div>
        </section>
      </main>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="fact">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function Bar({ label, value }: { label: string; value: number }) {
  const pct = Math.max(0, Math.min(100, value / 10));
  return (
    <li className="bar">
      <span className="bar-label">{label}</span>
      <span className="bar-track">
        <span className="bar-fill" style={{ width: `${pct}%` }} />
      </span>
      <span className="bar-value">{value}</span>
    </li>
  );
}
