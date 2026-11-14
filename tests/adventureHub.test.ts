import { describe, expect, it } from "vitest";
import { PASTURE_ZONE } from "../src/world/config/zones";
import {
  DESK_STATION_KINDS,
  stationByKind,
  stationPrompt,
} from "../src/pasture3d/stationInteract";
import {
  MINIMAP_STATION_ICON,
  layoutMiniMapStations,
  snapMiniMapClick,
} from "../src/pasture3d/minimap";
import { yardLabelForKind } from "../src/pasture3d/yardLabels";
import { CITY_RESERVED_LOTS } from "../src/pasture3d/cityLayout";
import { YARD_KIT_FOOTPRINTS } from "../src/pasture3d/yardKitObstacles";
import {
  cardMatchesFilters,
  emptyDispatchFilters,
  formatCountdown,
  lockedSlotMilestones,
  runProgress,
} from "../src/ui/adventureHub";
import {
  estimateAdventure,
  snapshotStyleLuck,
} from "../src/content/adventures";

describe("Dispatch station wiring", () => {
  it("registers a street-front dispatch storefront with minimap snap", () => {
    expect(DESK_STATION_KINDS).toContain("dispatch");
    const station = stationByKind(PASTURE_ZONE, "dispatch");
    expect(station).toBeTruthy();
    expect(station?.position).toEqual({ x: 24, y: 0, z: 0 });
    expect(stationPrompt(station!)).toMatch(/Dispatch/i);
    const land = PASTURE_ZONE.landmarks.find(
      (row) => row.id === "dispatch-station",
    );
    expect(land?.position).toEqual(station?.position);
    expect(yardLabelForKind("dispatch").title).toBe("DISPATCH");
    expect(MINIMAP_STATION_ICON.dispatch).toBe("A");
    expect(CITY_RESERVED_LOTS.some((lot) => lot.x === 24 && lot.z === 0)).toBe(
      true,
    );
    expect(
      YARD_KIT_FOOTPRINTS.some((row) => row.landmarkId === "dispatch-station"),
    ).toBe(true);
    const laid = layoutMiniMapStations(140);
    const marker = laid.find((row) => row.kind === "dispatch");
    expect(marker).toBeTruthy();
    expect(
      snapMiniMapClick({ x: marker!.mapX, y: marker!.mapY }, laid)?.kind,
    ).toBe("dispatch");
  });
});

describe("hub helpers", () => {
  it("formats countdowns and filters cards", () => {
    expect(formatCountdown(65_000)).toBe("1:05");
    expect(formatCountdown(3_600_000)).toMatch(/1h/);
    const preview = estimateAdventure({
      locationId: "night-market",
      durationId: "quick",
      snapshot: snapshotStyleLuck({ equippedIds: [] }),
    });
    expect(
      cardMatchesFilters(
        "night-market",
        "quick",
        emptyDispatchFilters(),
        preview,
      ),
    ).toBe(true);
    expect(
      cardMatchesFilters(
        "night-market",
        "quick",
        { durationId: "session", rarity: "all" },
        preview,
      ),
    ).toBe(false);
    const run = {
      id: "r",
      locationId: "night-market",
      durationId: "quick",
      slot: 1,
      startedAt: 0,
      endsAt: 100,
      completedAt: null,
      outcome: null,
      status: "running" as const,
      claimedAt: null,
      diminishing: 1,
      rewards: [],
    };
    expect(runProgress(run, 50)).toBe(0.5);
    expect(lockedSlotMilestones(1)[0]?.slots).toBe(2);
  });
});
