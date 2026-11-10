/** Accessible popovers explaining why activity controls are disabled. */

export type DisableReason =
  | "connect"
  | "hatch"
  | "busy"
  | "limit"
  | "in_progress"
  | "claim_pending"
  | "session"
  | null;

export function disableReasonText(
  reason: DisableReason,
  extras?: { resetHint?: string },
): string {
  switch (reason) {
    case "connect":
      return "Connect Boing Express on the pasture page first, then come back to play.";
    case "hatch":
      return "Hatch a buddy on the pasture (tiny self-transfer) before activities unlock.";
    case "busy":
      return "Another action is in progress — wait for it to finish.";
    case "limit":
      return `Daily attempt limit reached.${extras?.resetHint ? " " + extras.resetHint : " Resets at UTC midnight."}`;
    case "in_progress":
      return "Finish the current mini-game attempt before starting another.";
    case "claim_pending":
      return "You have a successful catch waiting — sign to keep it, or wait for it to expire.";
    case "session":
      return "Approve a short activity session signature so attempts can be tracked without a wallet transfer.";
    default:
      return "";
  }
}

/** Attach hover/focus/tap popover explaining a disabled control. */
export function bindDisablePopover(
  button: HTMLButtonElement,
  getReason: () => DisableReason,
  extras?: () => { resetHint?: string },
) {
  let tip = document.getElementById(
    "activity-disable-tip",
  ) as HTMLDivElement | null;
  if (!tip) {
    tip = document.createElement("div");
    tip.id = "activity-disable-tip";
    tip.className = "activity-tip";
    tip.setAttribute("role", "tooltip");
    tip.hidden = true;
    document.body.append(tip);
  }

  const show = () => {
    if (!button.disabled) {
      tip!.hidden = true;
      return;
    }
    const reason = getReason();
    const text = disableReasonText(reason, extras?.());
    if (!text) {
      tip!.hidden = true;
      return;
    }
    tip!.textContent = text;
    tip!.hidden = false;
    const rect = button.getBoundingClientRect();
    tip!.style.left = `${Math.min(window.innerWidth - 280, Math.max(8, rect.left))}px`;
    tip!.style.top = `${rect.bottom + 8 + window.scrollY}px`;
  };
  const hide = () => {
    tip!.hidden = true;
  };

  button.addEventListener("mouseenter", show);
  button.addEventListener("focus", show);
  button.addEventListener("mouseleave", hide);
  button.addEventListener("blur", hide);
  button.addEventListener("click", (event) => {
    if (!button.disabled) return;
    event.preventDefault();
    event.stopPropagation();
    if (tip!.hidden) show();
    else hide();
  });
  button.setAttribute("aria-describedby", "activity-disable-tip");
}
