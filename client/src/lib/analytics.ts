type AnalyticsData = Record<string, string | number | boolean>;
type AnalyticsEvent =
  | 'stock_search_submitted'
  | 'stock_search_completed'
  | 'valuation_calculated'
  | 'valuation_method_changed'
  | 'watchlist_changed'
  | 'valuation_report_exported'
  | string;

const FUNNEL_EVENT_PROPERTIES: Record<string, readonly string[]> = {
  stock_search_submitted: ['location'],
  stock_search_completed: ['outcome', 'source', 'location'],
  valuation_calculated: ['outcome', 'quality_available', 'location'],
  valuation_method_changed: ['method', 'location'],
  watchlist_changed: ['action', 'location'],
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

export function trackEvent(name: AnalyticsEvent, data?: AnalyticsData): void {
  if (typeof window === "undefined") return;

  try {
    window.umami?.track(name, sanitizeEventData(name, data));
  } catch {
    // Analytics must never affect the user experience.
  }
}