// Prices, times and countdowns, in the visitor's language and the house's currency.

/** "SEK 18 500" or "SEK 1 250,50": whole amounts without decimals, others with two. */
export function formatMoney(amount: number | null | undefined, currency: string, locale?: string): string {
  if (amount == null) return "—";
  const whole = Number.isInteger(amount);
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    currencyDisplay: "code",
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

/** "21 Oct 2026, 18:00". */
export function formatWhen(iso: string, locale?: string): string {
  return new Date(iso).toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" });
}

/** Time left until `to`: "2 d 4 h", "3 h 12 min", "11 min", "1:58" in the last ten minutes, "Ended" after it. */
export function formatRemaining(to: string, now = Date.now()): string {
  const seconds = Math.floor((new Date(to).getTime() - now) / 1000);
  if (seconds <= 0) return "Ended";
  if (seconds < 600) return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
  const minutes = Math.floor(seconds / 60);
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  if (days > 0) return `${days} d ${hours} h`;
  if (hours > 0) return `${hours} h ${minutes % 60} min`;
  return `${minutes} min`;
}

/** Less than an hour left: shown as urgent. */
export function isEndingSoon(to: string, now = Date.now()): boolean {
  const left = new Date(to).getTime() - now;
  return left > 0 && left < 3_600_000;
}

/** "1 bid", "3 bids", "No bids yet". */
export function bidsText(count: number): string {
  return count === 0 ? "No bids yet" : `${count} ${count === 1 ? "bid" : "bids"}`;
}
