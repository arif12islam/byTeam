/**
 * Money is kept as text in numeric(12,2) columns and worked out in whole
 * cents (paisa) here, never in floating point. Percentages are kept in
 * hundredths of a percent, so 62.5% is 6250.
 */

export const MAX_CENTS = 999_999_999_999; // numeric(12,2): 9,999,999,999.99

/** "30,000.5" becomes 3000050. Null when it is not a plain amount with at most two decimals. */
export function parseMoneyToCents(value: string): number | null {
  const text = value.trim().replace(/,/g, "");
  const match = /^(\d{1,10})(?:\.(\d{1,2}))?$/.exec(text);
  if (!match) return null;
  return Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
}

/** 3000050 becomes "30000.50". */
export function centsToMoney(cents: number): string {
  const whole = Math.floor(cents / 100);
  const frac = String(cents % 100).padStart(2, "0");
  return `${whole}.${frac}`;
}

/** "62.5" becomes 6250. Null unless it is 0 to 100 with at most two decimals. */
export function parsePercentToHundredths(value: string): number | null {
  const match = /^(\d{1,3})(?:\.(\d{1,2}))?$/.exec(value.trim());
  if (!match) return null;
  const hundredths = Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
  return hundredths <= 10_000 ? hundredths : null;
}

/** 6250 becomes "62.50". */
export function hundredthsToPercent(hundredths: number): string {
  return centsToMoney(hundredths);
}

/** Part of an amount, rounded half up to the nearest cent. BigInt keeps large amounts exact. */
export function percentOfCents(cents: number, hundredths: number): number {
  return Number((BigInt(cents) * BigInt(hundredths) + BigInt(5000)) / BigInt(10_000));
}

const takaFormatter = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** "3000050" cents or "30000.50" as "30,000.50". Lakh grouping, as used in Bangladesh: 1,00,000.00. */
export function formatTaka(amount: string): string {
  const cents = parseMoneyToCents(amount);
  return cents === null ? amount : takaFormatter.format(cents / 100);
}

/** Like `formatTaka`, but also handles a negative amount such as "-12.00". */
export function formatTakaSigned(amount: string): string {
  return amount.startsWith("-") ? `-${formatTaka(amount.slice(1))}` : formatTaka(amount);
}
