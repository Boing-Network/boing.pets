/** Display names only. Ledger keys stay boinglets / sparkles. */

export const CURRENCY_LABELS = {
  boinglets: "Cred",
  sparkles: "Laces",
} as const;

export type CurrencyKey = keyof typeof CURRENCY_LABELS;

export function currencyLabel(key: string): string {
  if (key in CURRENCY_LABELS) {
    return CURRENCY_LABELS[key as CurrencyKey];
  }
  return key;
}
