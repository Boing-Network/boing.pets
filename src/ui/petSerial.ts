/** Display-only serial derived from existing hatch data. No new persistence. */
export function petSerialLabel(hatchTx: string | null | undefined): string {
  const hex = (hatchTx || "").replace(/^0x/i, "").slice(0, 8);
  const n = Number.parseInt(hex, 16);
  if (!Number.isFinite(n)) return "#000";
  return "#" + String(n % 1000).padStart(3, "0");
}
