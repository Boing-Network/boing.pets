import { useEffect, useId, useRef } from "react";
import { ACTIVITY_AREA_META, type ActivityAreaMeta } from "./activityAreas";
import type { ActivityStationKind } from "./stationInteract";
import { activityPanelHtml } from "../ui/activityPanels";
import {
  refreshFishing,
  refreshMining,
  refreshRacing,
  refreshTreasure,
} from "../ui/pages/activitiesPage";
import { refreshGarden, refreshKitchen } from "../ui/pages/lifestylePage";
import { resetActivityOverlayState } from "../ui/minigames/playActivity";

async function refreshActivity(kind: ActivityStationKind) {
  switch (kind) {
    case "mine":
      await refreshMining();
      return;
    case "fish":
      await refreshFishing();
      return;
    case "treasure":
      await refreshTreasure();
      return;
    case "garden":
      await refreshGarden();
      return;
    case "cook":
      await refreshKitchen();
      return;
    case "race":
      await refreshRacing();
      return;
  }
}

export function PastureActivityMenu({
  kind,
  onClose,
}: {
  kind: ActivityStationKind;
  onClose: () => void;
}) {
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const meta: ActivityAreaMeta = ACTIVITY_AREA_META[kind];

  useEffect(() => {
    const root = bodyRef.current;
    if (!root) return;
    root.innerHTML = activityPanelHtml(meta.activity);
    closeRef.current?.focus();
    void refreshActivity(kind).catch(() => undefined);
    return () => {
      resetActivityOverlayState();
      root.innerHTML = "";
    };
  }, [kind, meta.activity]);

  return (
    <div
      className="pasture-station-menu pasture-activity-menu"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <div className="pasture-station-menu-head">
        <div>
          <p className="eyebrow">{meta.eyebrow}</p>
          <h2 id={titleId}>{meta.title}</h2>
        </div>
        <button
          ref={closeRef}
          type="button"
          className="quiet pasture-station-close"
          onClick={onClose}
        >
          Close
        </button>
      </div>
      <div ref={bodyRef} className="pasture-activity-body" />
      <p className="small">
        The full desk is also at{" "}
        <a href={meta.fallbackPath}>{meta.fallbackPath}</a>.
      </p>
    </div>
  );
}
