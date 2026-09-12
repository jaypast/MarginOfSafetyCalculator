type AnalyticsData = Record<string, string | number | boolean>;

export type ValuationMethodDimension = 'dcf' | 'pe' | 'graham';
export type ValuationOutcome =
  | 'undervalued'
  | 'fairly_valued'
  | 'overvalued'
  | 'unavailable';

interface DecisionFunnelEventMap {
  stock_search_submitted: {
    location: 'calculator';
  };
  stock_search_completed: {
    outcome: 'success' | 'error';
    source: string;
    location: 'calculator';
  };
  valuation_completed: {
    method: ValuationMethodDimension;
    outcome: ValuationOutcome;
    location: 'calculator';
  };
  report_generated: {
    method: ValuationMethodDimension;
    outcome: ValuationOutcome;
    format: 'show_work';
    location: 'valuation_results';
  };
  watchlist_changed: {
    action: 'add' | 'remove';
    location: 'calculator' | 'watchlist';
    method?: ValuationMethodDimension;
    outcome?: ValuationOutcome;
  };
}

export type DecisionFunnelEventName = keyof DecisionFunnelEventMap;

const FUNNEL_EVENT_PROPERTIES: Record<string, readonly string[]> = {
  stock_search_submitted: ['location'],
  stock_search_completed: ['outcome', 'source', 'location'],
  valuation_completed: ['method', 'outcome', 'location'],
  report_generated: ['method', 'outcome', 'format', 'location'],
  watchlist_changed: ['action', 'location', 'method', 'outcome'],
  valuation_method_changed: ['method', 'location'],
  valuation_calculated: ['outcome', 'quality_available', 'location'],
  valuation_report_exported: ['format', 'location'],
};

function sanitizeEventData(name: string, data?: AnalyticsData): AnalyticsData | undefined {
  if (!data) return undefined;
  const allowed = FUNNEL_EVENT_PROPERTIES[name];
  if (!allowed) return data;
  return Object.fromEntries(
    allowed
      .filter((key) => Object.prototype.hasOwnProperty.call(data, key))
      .map((key) => [key, data[key]]),
  );
}

declare global {
  interface Window {
    umami?: {
      track(name: string, data?: AnalyticsData): void;
    };
  }
}

export function trackEvent(name: string, data?: AnalyticsData): void {
  if (typeof window === "undefined") return;

  try {
    window.umami?.track(name, sanitizeEventData(name, data));
  } catch {
    // Analytics must never affect the user experience.
  }
}

export function trackDecisionFunnelEvent<Name extends DecisionFunnelEventName>(
  name: Name,
  data: DecisionFunnelEventMap[Name],
): void {
  trackEvent(name, data);
}

export function classifyValuationOutcome(
  intrinsicValue: number | undefined,
  discountPremium: number | undefined,
): ValuationOutcome {
  if (
    intrinsicValue === undefined
    || discountPremium === undefined
    || !Number.isFinite(intrinsicValue)
    || !Number.isFinite(discountPremium)
    || intrinsicValue <= 0
  ) {
    return 'unavailable';
  }
  if (discountPremium <= -10) return 'undervalued';
  if (discountPremium < 10) return 'fairly_valued';
  return 'overvalued';
}
