import { useEffect, useState } from "react";
import type { ActivityStationKind } from "./stationInteract";
import {
  activityTipFor,
  hasSeenActivityTip,
  markActivityTipSeen,
} from "./activityTips";

export function PastureActivityTip({ kind }: { kind: ActivityStationKind }) {
  const [visible, setVisible] = useState(() => !hasSeenActivityTip(kind));
  useEffect(() => {
    setVisible(!hasSeenActivityTip(kind));
  }, [kind]);
  if (!visible) return null;
  const tip = activityTipFor(kind);
  return (
    <aside className="pasture-activity-tip" role="status" data-tip={kind}>
      <div className="pasture-activity-tip-head">
        <p className="eyebrow">First time here</p>
        <button
          type="button"
          className="quiet pasture-activity-tip-dismiss"
          onClick={() => {
            markActivityTipSeen(kind);
            setVisible(false);
          }}
        >
          Got it
        </button>
      </div>
      <p className="pasture-activity-tip-title">{tip.title}</p>
      <p className="pasture-activity-tip-body">{tip.body}</p>
    </aside>
  );
}
