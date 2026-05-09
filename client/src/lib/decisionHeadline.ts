// Decision headline helper (Task #34).
//
// Pure function — no React deps — so it can be unit-tested without a DOM.
// Derives the single most-important sentence the user needs: is the stock
// in the buy zone, how far away, and which inputs drove that answer?

import type { StockData, ValuationResult } from './types';
import { classifyBuyZone, priceVsBuyBelowPct, type BuyZone } from './watchlist';
import { formatCurrency } from './utils';

export type HeadlineUnavailableReason = 'no_stock' | 'loading' | 'unmodelable';

export type HeadlineResult =
  | {
      available: true;
      zone: BuyZone;
      price: number;
      buyBelow: number;
      intrinsicValue: number;
      pctVsBuyBelow: number;
      sentence: string;
      marginOfSafety: number;
    }
  | {
      available: false;
      reason: HeadlineUnavailableReason;
    };

// Build the decision headline from whatever data the parent currently has.
// `valuationResults` must contain an 'Average' row (produced by
// `calculateAverageValuation`); if it doesn't, the headline falls back to
// 'unmodelable' rather than displaying a misleading number.
export function buildDecisionHeadline(
  stockData: StockData | undefined,
  valuationResults: ValuationResult[],
  marginOfSafety: number,
): HeadlineResult {
  if (!stockData || stockData.error) {
    return { available: false, reason: 'no_stock' };
  }
  if (valuationResults.length === 0) {
    return { available: false, reason: 'loading' };
  }

  const avg = valuationResults.find((r) => r.method === 'Average');
  if (
    !avg ||
    !Number.isFinite(avg.intrinsicValue) ||
    avg.intrinsicValue <= 0 ||
    !Number.isFinite(avg.buyBelow) ||
    avg.buyBelow <= 0
  ) {
    return { available: false, reason: 'unmodelable' };
  }

  const zone = classifyBuyZone(stockData.price, avg.buyBelow);
  const pctVsBuyBelow = priceVsBuyBelowPct(stockData.price, avg.buyBelow) ?? 0;
  const absPct = Math.abs(pctVsBuyBelow).toFixed(1);
  const bbStr = formatCurrency(avg.buyBelow);
  const ivStr = formatCurrency(avg.intrinsicValue);
  const mosNote = `${marginOfSafety}% MoS on ${ivStr} avg. intrinsic value`;

  let sentence: string;
  if (zone === 'buy') {
    sentence = `${absPct}% below your buy-below of ${bbStr} — in the buy zone (${mosNote}).`;
  } else if (zone === 'near') {
    sentence = `${absPct}% above your buy-below of ${bbStr} — getting close (${mosNote}).`;
  } else {
    sentence = `${absPct}% above your buy-below of ${bbStr} (${mosNote}).`;
  }

  return {
    available: true,
    zone,
    price: stockData.price,
    buyBelow: avg.buyBelow,
    intrinsicValue: avg.intrinsicValue,
    pctVsBuyBelow,
    sentence,
    marginOfSafety,
  };
}
