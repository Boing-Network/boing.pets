import { useEffect, useId, useState } from "react";
import {
  ADVENTURE_TUTORIAL_STEPS,
  advanceAdventureTutorial,
  adventureTutorialStep,
  isAdventureTutorialVisible,
  loadAdventureTutorial,
  saveAdventureTutorial,
  skipAdventureTutorial,
  type AdventureTutorialState,
} from "../onboarding/adventureTutorial";

export function AdventureTutorialCard({ enabled }: { enabled: boolean }) {
  const titleId = useId();
  const [state, setState] = useState<AdventureTutorialState | null>(null);

  useEffect(() => {
    if (!enabled) return;
    setState(loadAdventureTutorial());
  }, [enabled]);

  if (!enabled || !state || !isAdventureTutorialVisible(state)) return null;
  const step = adventureTutorialStep(state.step);
  if (!step) return null;
  const index = ADVENTURE_TUTORIAL_STEPS.findIndex((row) => row.id === step.id);
  const persist = (next: AdventureTutorialState) => {
    setState(saveAdventureTutorial(next));
  };

  return (
    <aside
      className="adventure-tutorial"
      role="region"
      aria-labelledby={titleId}
    >
      <p className="eyebrow">
        First time · {index + 1} / {ADVENTURE_TUTORIAL_STEPS.length}
      </p>
      <h3 id={titleId}>{step.title}</h3>
      <p>{step.body}</p>
      <div className="adventure-tutorial-actions">
        <button
          type="button"
          onClick={() => persist(advanceAdventureTutorial(state))}
        >
          {step.primaryLabel}
        </button>
        <button
          type="button"
          className="quiet"
          onClick={() => persist(skipAdventureTutorial(state))}
        >
          Skip
        </button>
      </div>
    </aside>
  );
}
