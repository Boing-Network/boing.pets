-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "CreatureStatus" AS ENUM ('ALIVE', 'DEAD');

-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('FEMALE', 'MALE');

-- CreateEnum
CREATE TYPE "Diet" AS ENUM ('HERBIVORE');

-- CreateEnum
CREATE TYPE "Goal" AS ENUM ('FIND_FOOD', 'DRINK_WATER', 'SEEK_SHELTER', 'SOCIALIZE', 'EXPLORE', 'FIND_MATE', 'PROTECT_OFFSPRING', 'IDLE');

-- CreateEnum
CREATE TYPE "Action" AS ENUM ('FORAGE', 'CONTEST', 'COOPERATE_FORAGE', 'DRINK', 'REST', 'RELOCATE', 'APPROACH', 'WANDER', 'COURT', 'GUARD', 'NURSE');

-- CreateEnum
CREATE TYPE "ActionTargetKind" AS ENUM ('NONE', 'CREATURE', 'TERRITORY');

-- CreateEnum
CREATE TYPE "MemoryKind" AS ENUM ('CONVERSATION', 'GIFT', 'RESCUE', 'PARENT_DEATH', 'FIRST_CHILD', 'THREAT', 'MATE', 'DISCOVERY', 'MIGRATION', 'CONFLICT', 'COOPERATION');

-- CreateEnum
CREATE TYPE "EventKind" AS ENUM ('BIRTH', 'DEATH', 'MATING', 'DISCOVERY', 'MIGRATION');

-- CreateEnum
CREATE TYPE "DeathCause" AS ENUM ('OLD_AGE', 'STARVATION', 'THIRST', 'ILLNESS', 'INJURY');

-- CreateEnum
CREATE TYPE "InfluenceKind" AS ENUM ('NAME_CREATURE', 'NAME_LINEAGE', 'FAVOR_BLOODLINE', 'ENRICH_TERRITORY', 'CALM_TERRITORY');

-- CreateEnum
CREATE TYPE "ModifierKind" AS ENUM ('FOOD', 'DANGER');

-- CreateTable
CREATE TABLE "world" (
    "id" BIGINT NOT NULL,
    "name" TEXT NOT NULL,
    "seed" BIGINT NOT NULL,
    "schema_version" INTEGER NOT NULL,
    "ruleset_version" INTEGER NOT NULL,
    "ruleset" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL,
    "clock_at" TIMESTAMP(3) NOT NULL,
    "last_tick" BIGINT NOT NULL,
    "next_creature_id" BIGINT NOT NULL,
    "next_memory_id" BIGINT NOT NULL,
    "next_relationship_id" BIGINT NOT NULL,
    "next_event_id" BIGINT NOT NULL,
    "next_lineage_id" BIGINT NOT NULL,
    "next_modifier_id" BIGINT NOT NULL,
    "next_territory_id" BIGINT NOT NULL,
    "next_influence_id" BIGINT NOT NULL,

    CONSTRAINT "world_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "species" (
    "id" BIGINT NOT NULL,
    "world_id" BIGINT NOT NULL,
    "slug" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "diet" "Diet" NOT NULL,
    "maturity_days" INTEGER NOT NULL,
    "base_lifespan_days" INTEGER NOT NULL,
    "gestation_days" INTEGER NOT NULL,
    "juvenile_days" INTEGER NOT NULL,
    "base_curiosity" INTEGER NOT NULL,
    "base_aggression" INTEGER NOT NULL,
    "base_loyalty" INTEGER NOT NULL,
    "base_sociability" INTEGER NOT NULL,
    "base_bravery" INTEGER NOT NULL,
    "base_risk_taking" INTEGER NOT NULL,
    "color_hex" TEXT NOT NULL,

    CONSTRAINT "species_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "species_compatibility" (
    "world_id" BIGINT NOT NULL,
    "species_low_id" BIGINT NOT NULL,
    "species_high_id" BIGINT NOT NULL,
    "fertility" INTEGER NOT NULL,

    CONSTRAINT "species_compatibility_pkey" PRIMARY KEY ("world_id","species_low_id","species_high_id")
);

-- CreateTable
CREATE TABLE "territory" (
    "id" BIGINT NOT NULL,
    "world_id" BIGINT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "food_abundance" INTEGER NOT NULL,
    "danger" INTEGER NOT NULL,
    "capacity" INTEGER NOT NULL,

    CONSTRAINT "territory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "territory_link" (
    "world_id" BIGINT NOT NULL,
    "from_id" BIGINT NOT NULL,
    "to_id" BIGINT NOT NULL,
    "travel_ticks" INTEGER NOT NULL,

    CONSTRAINT "territory_link_pkey" PRIMARY KEY ("from_id","to_id")
);

-- CreateTable
CREATE TABLE "territory_modifier" (
    "id" BIGINT NOT NULL,
    "world_id" BIGINT NOT NULL,
    "territory_id" BIGINT NOT NULL,
    "kind" "ModifierKind" NOT NULL,
    "amount" INTEGER NOT NULL,
    "start_tick" BIGINT NOT NULL,
    "end_tick" BIGINT NOT NULL,
    "source_influence_id" BIGINT,

    CONSTRAINT "territory_modifier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lineage" (
    "id" BIGINT NOT NULL,
    "world_id" BIGINT NOT NULL,
    "founder_creature_id" BIGINT,
    "species_id" BIGINT NOT NULL,
    "name" TEXT NOT NULL,
    "founded_tick" BIGINT NOT NULL,
    "player_favor" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "lineage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "creature" (
    "id" BIGINT NOT NULL,
    "world_id" BIGINT NOT NULL,
    "name" TEXT NOT NULL,
    "name_given_by_player" BOOLEAN NOT NULL DEFAULT false,
    "species_id" BIGINT NOT NULL,
    "gender" "Gender" NOT NULL,
    "status" "CreatureStatus" NOT NULL,
    "birth_tick" BIGINT NOT NULL,
    "death_tick" BIGINT,
    "death_cause" "DeathCause",
    "territory_id" BIGINT NOT NULL,
    "lineage_id" BIGINT NOT NULL,
    "mother_id" BIGINT,
    "father_id" BIGINT,
    "generation" INTEGER NOT NULL,
    "gene_strength" INTEGER NOT NULL,
    "gene_speed" INTEGER NOT NULL,
    "gene_intelligence" INTEGER NOT NULL,
    "gene_curiosity" INTEGER NOT NULL,
    "gene_sociability" INTEGER NOT NULL,
    "genes_extra" JSONB NOT NULL DEFAULT '{}',
    "trait_curiosity" INTEGER NOT NULL,
    "trait_aggression" INTEGER NOT NULL,
    "trait_loyalty" INTEGER NOT NULL,
    "trait_sociability" INTEGER NOT NULL,
    "trait_bravery" INTEGER NOT NULL,
    "trait_risk_taking" INTEGER NOT NULL,
    "personality_extra" JSONB NOT NULL DEFAULT '{}',
    "hunger" INTEGER NOT NULL,
    "thirst" INTEGER NOT NULL,
    "fatigue" INTEGER NOT NULL,
    "discomfort" INTEGER NOT NULL,
    "unsafety" INTEGER NOT NULL,
    "loneliness" INTEGER NOT NULL,
    "health" INTEGER NOT NULL,
    "current_goal" "Goal" NOT NULL,
    "current_action" "Action",
    "action_target_kind" "ActionTargetKind" NOT NULL DEFAULT 'NONE',
    "action_target_id" BIGINT,
    "action_started_tick" BIGINT,
    "action_ends_tick" BIGINT,
    "gestation_sire_id" BIGINT,
    "gestation_end_tick" BIGINT,
    "mate_cooldown_until_tick" BIGINT,

    CONSTRAINT "creature_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "relationship" (
    "id" BIGINT NOT NULL,
    "world_id" BIGINT NOT NULL,
    "creature_a_id" BIGINT NOT NULL,
    "creature_b_id" BIGINT NOT NULL,
    "score" INTEGER NOT NULL,
    "friendship" INTEGER NOT NULL,
    "romance" INTEGER NOT NULL,
    "trust" INTEGER NOT NULL,
    "cooperation" INTEGER NOT NULL,
    "avoidance" INTEGER NOT NULL,
    "conflict" INTEGER NOT NULL,
    "met_tick" BIGINT NOT NULL,
    "last_interaction_tick" BIGINT NOT NULL,
    "interaction_count" INTEGER NOT NULL,

    CONSTRAINT "relationship_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "memory" (
    "id" BIGINT NOT NULL,
    "world_id" BIGINT NOT NULL,
    "creature_id" BIGINT NOT NULL,
    "tick" BIGINT NOT NULL,
    "kind" "MemoryKind" NOT NULL,
    "importance" INTEGER NOT NULL,
    "emotional_value" INTEGER NOT NULL,
    "initial_strength" INTEGER NOT NULL,
    "subject_creature_id" BIGINT,
    "territory_id" BIGINT,
    "payload" JSONB NOT NULL,
    "archived" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "memory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "world_event" (
    "id" BIGINT NOT NULL,
    "world_id" BIGINT NOT NULL,
    "tick" BIGINT NOT NULL,
    "kind" "EventKind" NOT NULL,
    "actor_id" BIGINT,
    "subject_id" BIGINT,
    "territory_id" BIGINT,
    "lineage_id" BIGINT,
    "summary" TEXT NOT NULL,
    "payload" JSONB NOT NULL,

    CONSTRAINT "world_event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "player_influence" (
    "id" BIGINT NOT NULL,
    "world_id" BIGINT NOT NULL,
    "kind" "InfluenceKind" NOT NULL,
    "issued_at_tick" BIGINT NOT NULL,
    "payload" JSONB NOT NULL,
    "applied" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "player_influence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "catchup_report" (
    "id" BIGINT NOT NULL,
    "world_id" BIGINT NOT NULL,
    "from_tick" BIGINT NOT NULL,
    "to_tick" BIGINT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL,
    "summary" JSONB NOT NULL,

    CONSTRAINT "catchup_report_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "species_world_id_slug_key" ON "species"("world_id", "slug");

-- CreateIndex
CREATE INDEX "territory_world_id_idx" ON "territory"("world_id");

-- CreateIndex
CREATE UNIQUE INDEX "territory_world_id_slug_key" ON "territory"("world_id", "slug");

-- CreateIndex
CREATE INDEX "territory_link_to_id_idx" ON "territory_link"("to_id");

-- CreateIndex
CREATE INDEX "territory_modifier_world_id_territory_id_start_tick_end_tic_idx" ON "territory_modifier"("world_id", "territory_id", "start_tick", "end_tick");

-- CreateIndex
CREATE INDEX "lineage_world_id_player_favor_idx" ON "lineage"("world_id", "player_favor");

-- CreateIndex
CREATE INDEX "creature_world_id_status_idx" ON "creature"("world_id", "status");

-- CreateIndex
CREATE INDEX "creature_world_id_lineage_id_idx" ON "creature"("world_id", "lineage_id");

-- CreateIndex
CREATE INDEX "creature_world_id_species_id_status_idx" ON "creature"("world_id", "species_id", "status");

-- CreateIndex
CREATE INDEX "creature_mother_id_idx" ON "creature"("mother_id");

-- CreateIndex
CREATE INDEX "creature_father_id_idx" ON "creature"("father_id");

-- CreateIndex
CREATE INDEX "creature_lineage_id_status_idx" ON "creature"("lineage_id", "status");

-- CreateIndex
CREATE INDEX "relationship_creature_b_id_idx" ON "relationship"("creature_b_id");

-- CreateIndex
CREATE INDEX "relationship_world_id_score_idx" ON "relationship"("world_id", "score");

-- CreateIndex
CREATE UNIQUE INDEX "relationship_creature_a_id_creature_b_id_key" ON "relationship"("creature_a_id", "creature_b_id");

-- CreateIndex
CREATE INDEX "memory_creature_id_archived_idx" ON "memory"("creature_id", "archived");

-- CreateIndex
CREATE INDEX "memory_world_id_kind_idx" ON "memory"("world_id", "kind");

-- CreateIndex
CREATE INDEX "world_event_world_id_tick_id_idx" ON "world_event"("world_id", "tick", "id");

-- CreateIndex
CREATE INDEX "world_event_lineage_id_tick_idx" ON "world_event"("lineage_id", "tick");

-- CreateIndex
CREATE INDEX "world_event_actor_id_tick_idx" ON "world_event"("actor_id", "tick");

-- CreateIndex
CREATE INDEX "world_event_world_id_kind_tick_idx" ON "world_event"("world_id", "kind", "tick");

-- CreateIndex
CREATE INDEX "player_influence_world_id_applied_issued_at_tick_id_idx" ON "player_influence"("world_id", "applied", "issued_at_tick", "id");

-- CreateIndex
CREATE INDEX "catchup_report_world_id_to_tick_idx" ON "catchup_report"("world_id", "to_tick");

-- AddForeignKey
ALTER TABLE "species" ADD CONSTRAINT "species_world_id_fkey" FOREIGN KEY ("world_id") REFERENCES "world"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "species_compatibility" ADD CONSTRAINT "species_compatibility_world_id_fkey" FOREIGN KEY ("world_id") REFERENCES "world"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "territory" ADD CONSTRAINT "territory_world_id_fkey" FOREIGN KEY ("world_id") REFERENCES "world"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "territory_link" ADD CONSTRAINT "territory_link_world_id_fkey" FOREIGN KEY ("world_id") REFERENCES "world"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "territory_modifier" ADD CONSTRAINT "territory_modifier_world_id_fkey" FOREIGN KEY ("world_id") REFERENCES "world"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "territory_modifier" ADD CONSTRAINT "territory_modifier_territory_id_fkey" FOREIGN KEY ("territory_id") REFERENCES "territory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lineage" ADD CONSTRAINT "lineage_world_id_fkey" FOREIGN KEY ("world_id") REFERENCES "world"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "creature" ADD CONSTRAINT "creature_world_id_fkey" FOREIGN KEY ("world_id") REFERENCES "world"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "creature" ADD CONSTRAINT "creature_species_id_fkey" FOREIGN KEY ("species_id") REFERENCES "species"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "creature" ADD CONSTRAINT "creature_territory_id_fkey" FOREIGN KEY ("territory_id") REFERENCES "territory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "creature" ADD CONSTRAINT "creature_lineage_id_fkey" FOREIGN KEY ("lineage_id") REFERENCES "lineage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "creature" ADD CONSTRAINT "creature_mother_id_fkey" FOREIGN KEY ("mother_id") REFERENCES "creature"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "creature" ADD CONSTRAINT "creature_father_id_fkey" FOREIGN KEY ("father_id") REFERENCES "creature"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "relationship" ADD CONSTRAINT "relationship_world_id_fkey" FOREIGN KEY ("world_id") REFERENCES "world"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "relationship" ADD CONSTRAINT "relationship_creature_a_id_fkey" FOREIGN KEY ("creature_a_id") REFERENCES "creature"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "relationship" ADD CONSTRAINT "relationship_creature_b_id_fkey" FOREIGN KEY ("creature_b_id") REFERENCES "creature"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memory" ADD CONSTRAINT "memory_world_id_fkey" FOREIGN KEY ("world_id") REFERENCES "world"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memory" ADD CONSTRAINT "memory_creature_id_fkey" FOREIGN KEY ("creature_id") REFERENCES "creature"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "world_event" ADD CONSTRAINT "world_event_world_id_fkey" FOREIGN KEY ("world_id") REFERENCES "world"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "player_influence" ADD CONSTRAINT "player_influence_world_id_fkey" FOREIGN KEY ("world_id") REFERENCES "world"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "catchup_report" ADD CONSTRAINT "catchup_report_world_id_fkey" FOREIGN KEY ("world_id") REFERENCES "world"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Architecture checks and partial indexes. Prisma cannot express them.
ALTER TABLE creature ADD CONSTRAINT creature_ranges CHECK (
  gene_strength BETWEEN 0 AND 1000 AND gene_speed BETWEEN 0 AND 1000
  AND gene_intelligence BETWEEN 0 AND 1000 AND gene_curiosity BETWEEN 0 AND 1000
  AND gene_sociability BETWEEN 0 AND 1000
  AND trait_curiosity BETWEEN 0 AND 1000 AND trait_aggression BETWEEN 0 AND 1000
  AND trait_loyalty BETWEEN 0 AND 1000 AND trait_sociability BETWEEN 0 AND 1000
  AND trait_bravery BETWEEN 0 AND 1000 AND trait_risk_taking BETWEEN 0 AND 1000
  AND hunger BETWEEN 0 AND 1000 AND thirst BETWEEN 0 AND 1000
  AND fatigue BETWEEN 0 AND 1000 AND discomfort BETWEEN 0 AND 1000
  AND unsafety BETWEEN 0 AND 1000 AND loneliness BETWEEN 0 AND 1000
  AND health BETWEEN 0 AND 1000
  AND id <> mother_id AND id <> father_id
);

ALTER TABLE relationship ADD CONSTRAINT relationship_ordered CHECK (creature_a_id < creature_b_id);
ALTER TABLE relationship ADD CONSTRAINT relationship_ranges CHECK (
  score BETWEEN -1000 AND 1000
  AND friendship BETWEEN 0 AND 1000 AND romance BETWEEN 0 AND 1000
  AND trust BETWEEN 0 AND 1000 AND cooperation BETWEEN 0 AND 1000
  AND avoidance BETWEEN 0 AND 1000 AND conflict BETWEEN 0 AND 1000
);

ALTER TABLE memory ADD CONSTRAINT memory_importance_nonneg CHECK (importance >= 0);
ALTER TABLE memory ADD CONSTRAINT memory_strength_range CHECK (initial_strength BETWEEN 0 AND 1000);
ALTER TABLE memory ADD CONSTRAINT memory_emotion_range CHECK (emotional_value BETWEEN -1000 AND 1000);

CREATE INDEX creature_living_territory_idx
  ON creature (world_id, territory_id) WHERE status = 'ALIVE';
CREATE INDEX creature_living_action_end_idx
  ON creature (world_id, action_ends_tick) WHERE status = 'ALIVE';

