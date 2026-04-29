// Watchlist helpers — kept in their own module so the page component stays
// thin and so the buy-zone classifier is trivially unit-testable.

export type BuyZone = 'buy' | 'near' | 'neutral';

// Classify how close the current price is to the user's buy-below threshold.
//   - 'buy'     : price has crossed at or below the threshold
//   - 'near'    : price is within +10 % above the threshold (warming up)
//   - 'neutral' : price is more than +10 % above the threshold
//
// `buyBelow` <= 0 falls through to 'neutral' so degenerate intrinsic values
// (e.g. when valuation isn't applicable) don't paint the row green.
const NEAR_THRESHOLD_PCT = 10;

export function classifyBuyZone(price: number, buyBelow: number): BuyZone {
  if (!Number.isFinite(price) || !Number.isFinite(buyBelow) || buyBelow <= 0 || price <= 0) {
    return 'neutral';
  }
  if (price <= buyBelow) return 'buy';
  const headroomPct = ((price - buyBelow) / buyBelow) * 100;
  if (headroomPct <= NEAR_THRESHOLD_PCT) return 'near';
  return 'neutral';
}

// % above (positive) or below (negative) the buy-below threshold. Used by the
// row to tell the user "you need a 12.4% drop to enter the buy zone".
export function priceVsBuyBelowPct(price: number, buyBelow: number): number | null {
  if (!Number.isFinite(price) || !Number.isFinite(buyBelow) || buyBelow <= 0) return null;
  return ((price - buyBelow) / buyBelow) * 100;
}

// Short human-readable freshness label ("3m ago", "2h ago"). Mirrors the
// identical helper in StockInformation but is duplicated here so the watchlist
// page doesn't depend on a UI component.
export function describeFreshness(iso?: string): string {
  if (!iso) return '';
  const ts = new Date(iso).getTime();
  if (Number.isNaN(ts)) return '';
  const ageMs = Date.now() - ts;
  if (ageMs < 60_000) return 'just now';
  const minutes = Math.round(ageMs / 60_000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}
