import { useState } from "react";

const KEY = "living-pets.intro.v1";

function storage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

/**
 * First-visit orientation. The world is already moving when a player arrives
 * and nothing says what they can do, so say it once, briefly. Dismissal is
 * remembered per browser; if storage is unavailable it simply shows once per
 * page load.
 */
export function IntroTip() {
  const [open, setOpen] = useState(() => storage()?.getItem(KEY) !== "1");
  if (!open) return null;
  const close = () => {
    try {
      storage()?.setItem(KEY, "1");
    } catch {
      // Storage can be blocked; the tip just returns next visit.
    }
    setOpen(false);
  };
  return (
    <section
      className="catchup-panel intro-panel"
      role="dialog"
      aria-modal="false"
      aria-labelledby="intro-title"
    >
      <h2 id="intro-title" className="catchup-title">
        Welcome to the world
      </h2>
      <p className="catchup-span">
        These creatures live on their own: they forage, court, raise families
        and remember, whether or not you are watching.
      </p>
      <ul className="catchup-notable">
        <li>
          <strong>Look.</strong> Pick a creature from the list on the right to
          see what it wants, who it loves and where it came from.
        </li>
        <li>
          <strong>Nudge.</strong> You cannot command them, but a few times a day
          you can name a creature, favor a bloodline, or enrich or calm a
          territory.
        </li>
        <li>
          <strong>Time.</strong> The clock controls at the top speed the world
          up or pause it.
        </li>
      </ul>
      <button type="button" className="catchup-close" onClick={close}>
        Got it
      </button>
    </section>
  );
}
