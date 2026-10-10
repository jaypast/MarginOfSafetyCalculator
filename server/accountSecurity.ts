import { z } from "zod";

const allowedProperties: Record<string, readonly string[]> = {
  stock_search_submitted: ["location"],
  stock_search_completed: ["outcome", "source", "location"],
  valuation_completed: ["method", "outcome", "location"],
  report_generated: ["method", "outcome", "format", "location"],
  watchlist_changed: ["action", "location", "method", "outcome"],
  valuation_method_changed: ["method", "location"],
  valuation_calculated: ["outcome", "quality_available", "location"],
  valuation_report_exported: ["format", "location"],
  research_scan_started: ["refresh", "location"],
  research_scan_completed: ["outcome", "result_count", "location"],
  sp500_check_requested: ["location"],
  sp500_quarter_selected: ["quarter", "location"],
};

const allowedStringValues: Record<string, ReadonlySet<string>> = {
  action: new Set(["add", "remove"]),
  format: new Set(["show_work", "pdf", "csv"]),
  location: new Set(["calculator", "valuation_results", "watchlist", "research", "sp500_changes"]),
  method: new Set(["dcf", "pe", "graham"]),
  outcome: new Set(["success", "error", "undervalued", "fairly_valued", "overvalued", "unavailable"]),
  source: new Set(["yfinance", "rapidapi", "alphavantage", "fmp", "scraper", "fallback", "unknown"]),
};

export interface NormalizedAccountEvent {
  eventName: string;
  properties: Record<string, string | number | boolean>;
}

export function normalizeAccountEvent(input: unknown): NormalizedAccountEvent | null {
  const parsed = z.object({
    eventName: z.string().min(1).max(64),
    properties: z.record(z.union([z.string().max(80), z.number().finite(), z.boolean()])).optional(),
  }).safeParse(input);
  if (!parsed.success) return null;
  const allowed = allowedProperties[parsed.data.eventName];
  if (!allowed) return null;

  const properties: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(parsed.data.properties ?? {})) {
    if (!allowed.includes(key)) continue;
    if (typeof value === "string") {
      if (key === "quarter" && /^\d{4}Q[1-4]$/.test(value)) properties[key] = value;
      else if (allowedStringValues[key]?.has(value)) properties[key] = value;
    } else if ((key === "refresh" || key === "quality_available") && typeof value === "boolean") {
      properties[key] = value;
    } else if (key === "result_count" && typeof value === "number" && value >= 0 && value <= 100_000) {
      properties[key] = Math.floor(value);
    }
    if (Object.keys(properties).length >= 12) break;
  }
  return { eventName: parsed.data.eventName, properties };
}

export function quoteCsvCell(value: string | number | null | undefined): string {
  let text = value == null ? "" : String(value);
  if (/^[\t\r ]*[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}
