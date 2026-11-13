import { useCallback, useEffect, useState } from "react";
import {
  advanceWalkthrough,
  careActionCompletesStep,
  isWalkthroughVisible,
  loadWalkthrough,
  menuCompletesStep,
  saveWalkthrough,
  shouldAutoAdvanceOnPasture,
  skipWalkthrough,
  walkthroughStep,
  type WalkthroughScene,
  type WalkthroughState,
  type WalkthroughStepId,
} from "./walkthrough";

export type WalkthroughCardProps = {
  scene: WalkthroughScene;
  openMenuKind?: string | null;
  onGuideTo?: (step: WalkthroughStepId) => void;
};

export function WalkthroughCard({
  scene,
  openMenuKind = null,
  onGuideTo,
}: WalkthroughCardProps) {
  const [state, setState] = useState<WalkthroughState>(() => loadWalkthrough());

  const commit = useCallback((next: WalkthroughState) => {
    const saved = saveWalkthrough(next);
    setState(saved);
    return saved;
  }, []);

  useEffect(() => {
    if (scene !== "pasture") return;
    const next = shouldAutoAdvanceOnPasture(state);
    if (next) commit(next);
  }, [scene, state, commit]);

  useEffect(() => {
    if (menuCompletesStep(state.step, openMenuKind)) {
      commit(advanceWalkthrough(state));
    }
  }, [openMenuKind, state, commit]);

  useEffect(() => {
    const onClick = (event: Event) => {
      const target = event.target as Element | null;
      if (!target || typeof target.closest !== "function") return;
      const care = target.closest(
        "#buddy-chip, #buddy-close, #checkin, #play, #groom, #feed, #hatch",
      );
      if (!care) return;
      const action =
        care.id === "buddy-chip" || care.id === "buddy-close"
          ? "buddy-open"
          : care.id;
      if (careActionCompletesStep(state.step, action)) {
        commit(advanceWalkthrough(state));
      }
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [state, commit]);

  if (!isWalkthroughVisible(state, scene)) return null;

  const step = walkthroughStep(state.step);
  if (!step) return null;
  const index = Math.max(
    0,
    [
      "welcome-town",
      "enter-pasture",
      "visit-area",
      "visit-station",
      "pet-care",
      "done",
    ].indexOf(step.id),
  );
  const total = 5; // visible beats before the finale
  const progress = step.id === "done" ? total : Math.min(total, index + 1);

  const onPrimary = () => {
    if (step.id === "enter-pasture") {
      commit(advanceWalkthrough(state));
      window.location.assign("/");
      return;
    }
    if (step.guide && onGuideTo) {
      onGuideTo(step.id);
      return;
    }
    commit(advanceWalkthrough(state));
  };

  return (
    <aside
      className="walkthrough-card"
      role="dialog"
      aria-labelledby="walkthrough-title"
      data-walkthrough-step={step.id}
    >
      <p className="walkthrough-progress">
        {step.id === "done"
          ? "Tour complete"
          : "Tour " + progress + " of " + total}
      </p>
      <h2 id="walkthrough-title">{step.title}</h2>
      <p>{step.body}</p>
      <div className="walkthrough-actions">
        <button type="button" onClick={onPrimary}>
          {step.primaryLabel}
        </button>
        {step.id !== "done" ? (
          <button
            type="button"
            className="quiet"
            onClick={() => commit(skipWalkthrough(state))}
          >
            Skip tour
          </button>
        ) : null}
      </div>
    </aside>
  );
}
