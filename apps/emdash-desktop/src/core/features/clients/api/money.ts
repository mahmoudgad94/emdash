/** An amount in the currency's minor unit as the owner reads it, e.g. `$3,200.00`. */
export function formatMinor(amountMinor: number, currency: string | null): string {
  const amount = amountMinor / 100;
  if (currency === null) return amount.toLocaleString('en-US', { minimumFractionDigits: 2 });
  try {
    return amount.toLocaleString('en-US', { style: 'currency', currency });
  } catch {
    return `${amount.toLocaleString('en-US', { minimumFractionDigits: 2 })} ${currency}`;
  }
}
