/**
 * Insider activity signal engine (Task #74).
 *
 * Academic basis: Lakonishok & Lee (2001), Cohen et al. (2012).
 * Key finding: open-market insider BUYING — especially cluster buys by
 * C-suite officers — has statistically significant predictive value for
 * future returns. Insider SELLING is largely noise (diversification, taxes,
 * 10b5-1 plans) and generates no special treatment here.
 *
 * Architecture: purely additive — no existing valuation or verdict logic
 * is changed; this is a parallel conviction signal.
 */

// ─── Types ───────────────────────────────────────────────────────────────────

/** Mirrors the server-side InsiderTrade (shared/schema.ts). */
export interface InsiderTrade {
  reportingName: string;
  typeOfOwner: string;
  transactionDate: string;  // "YYYY-MM-DD"
  transactionType: string;  // "P-Purchase", "S-Sale", "A-Award", etc.
  securitiesTransacted: number;
  price: number;
}

export type InsiderSignalTier =
  | 'cluster-buy'  // ≥2 distinct C-suite open-market buyers in 90 days
  | 'recent-buy'   // ≥1 open-market purchase ≥$50K in 90 days
  | 'no-signal'    // no qualifying buying activity
  | 'sell-only';   // only selling in 90 days, no buying

export interface InsiderSignal {
  tier: InsiderSignalTier;
  /** One-line summary shown in the Quality Indicators row */
  summary: string;
  /** Up to 5 most recent trades shown in the micro-table */
  recentTrades: InsiderTrade[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * C-suite keywords matched against FMP's `typeOfOwner` field.
 * FMP formats these as "officer: Chief Executive Officer", "director", etc.
 */
export function isCsuite(typeOfOwner: string): boolean {
  const lower = typeOfOwner.toLowerCase();
  if (lower.includes('chief exec') || lower.includes('ceo')) return true;
  if (lower.includes('chief financial') || lower.includes('cfo')) return true;
  if (lower.includes('chief operating') || lower.includes('coo')) return true;
  if (lower.includes('chairman')) return true;
  // Match "President" but not "Vice President" (division/business-unit heads)
  if (lower.includes('president') && !lower.includes('vice president')) return true;
  return false;
}

export function isOpenMarketPurchase(transactionType: string): boolean {
  const lower = transactionType.toLowerCase().trim();
  // FMP: "P-Purchase"; some feeds use just "P"
  return lower === 'p-purchase' || lower === 'p';
}

export function isOpenMarketSale(transactionType: string): boolean {
  const lower = transactionType.toLowerCase().trim();
  // FMP: "S-Sale"; some feeds use just "S"
  return lower === 's-sale' || lower === 's';
}

function formatCurrency(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${Math.round(value / 1_000)}K`;
  return `$${Math.round(value).toLocaleString()}`;
}

function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr + 'T12:00:00Z');  // force UTC noon to avoid timezone drift
    return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  } catch {
    return dateStr;
  }
}

// ─── Core function ───────────────────────────────────────────────────────────

/**
 * Compute the insider activity signal tier from an array of Form 4 trades.
 *
 * Rules (all reference a 90-day lookback window):
 *  - cluster-buy  : ≥2 distinct C-suite purchasers (open-market only)
 *  - recent-buy   : ≥1 open-market purchase with value ≥ $50K
 *  - sell-only    : purchases = 0, sales > 0
 *  - no-signal    : everything else (no activity, or only awards/gifts)
 */
export function computeInsiderSignal(trades: InsiderTrade[]): InsiderSignal {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 90);

  const recentPurchases = trades.filter(t => {
    if (!isOpenMarketPurchase(t.transactionType)) return false;
    const d = new Date(t.transactionDate + 'T12:00:00Z');
    return d >= cutoff;
  });

  const recentSales = trades.filter(t => {
    if (!isOpenMarketSale(t.transactionType)) return false;
    const d = new Date(t.transactionDate + 'T12:00:00Z');
    return d >= cutoff;
  });

  const recentTrades = trades.slice(0, 5);

  // ── Cluster buy: ≥2 distinct C-suite buyers ──────────────────────────────
  const csuiteBuyers = Array.from(
    new Set(
      recentPurchases
        .filter(t => isCsuite(t.typeOfOwner))
        .map(t => t.reportingName),
    ),
  );

  if (csuiteBuyers.length >= 2) {
    const latest = recentPurchases[0];
    const value = latest.securitiesTransacted * latest.price;
    // Derive a short role label: "officer: Senior VP and CFO" → "CFO"
    const roleLabel = deriveRoleLabel(latest.typeOfOwner);
    return {
      tier: 'cluster-buy',
      summary: `${csuiteBuyers.length} C-suite open-market purchases · last: ${roleLabel} ${formatCurrency(value)} · ${formatDate(latest.transactionDate)}`,
      recentTrades,
    };
  }

  // ── Recent buy: ≥1 open-market purchase ≥ $50K ───────────────────────────
  const significantBuy = recentPurchases.find(
    t => t.securitiesTransacted * t.price >= 50_000,
  );

  if (significantBuy) {
    const value = significantBuy.securitiesTransacted * significantBuy.price;
    return {
      tier: 'recent-buy',
      summary: `Open-market purchase: ${significantBuy.reportingName} ${formatCurrency(value)} · ${formatDate(significantBuy.transactionDate)}`,
      recentTrades,
    };
  }

  // ── Sell-only: no purchases, but some sales ───────────────────────────────
  if (recentPurchases.length === 0 && recentSales.length > 0) {
    return {
      tier: 'sell-only',
      summary: `${recentSales.length} insider sale${recentSales.length > 1 ? 's' : ''} in 90 days · no open-market buying`,
      recentTrades,
    };
  }

  // ── No signal ─────────────────────────────────────────────────────────────
  return {
    tier: 'no-signal',
    summary:
      trades.length > 0
        ? 'No significant open-market buying in 90 days'
        : 'No recent Form 4 filings available',
    recentTrades,
  };
}

/** Extract a short role label from FMP's verbose typeOfOwner strings. */
function deriveRoleLabel(typeOfOwner: string): string {
  const lower = typeOfOwner.toLowerCase();
  if (lower.includes('chief exec') || lower.includes('ceo')) return 'CEO';
  if (lower.includes('chief financial') || lower.includes('cfo')) return 'CFO';
  if (lower.includes('chief operating') || lower.includes('coo')) return 'COO';
  if (lower.includes('president')) return 'President';
  if (lower.includes('chairman')) return 'Chairman';
  if (lower.includes('director')) return 'Director';
  return typeOfOwner.replace(/^officer:\s*/i, '').trim() || typeOfOwner;
}

// ─── Re-export formatters for the UI ─────────────────────────────────────────
export { formatCurrency, formatDate };
