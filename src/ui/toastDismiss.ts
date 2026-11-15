/** How long a Yard toast stays up. A retry button stays until the player acts. */
export const PASTURE_TOAST_DISMISS_MS = 4200;

export function pastureToastDismissMs(retry?: () => void): number | null {
  return retry ? null : PASTURE_TOAST_DISMISS_MS;
}
