import type { Sp500ChangeRow, Sp500EvaluationSnapshot, StockResponse } from "@shared/schema";
import { storage } from "../storage";
import { getHistoricalSp500Changes } from "./fmpFinance";
import { getStockData } from "./stockData";
import { computeQuality, estimateIntrinsicValue, hasUsableQualityMetrics } from "./researchScan";
import axios from "axios";

export interface NormalizedSp500Change {
  eventKey: string;
  effectiveDate: string;
  announcementDate: string | null;
  changeType: "addition" | "deletion";
  symbol: string;
  companyName: string;
  membershipSource: string;
}

const isoDate = (value: unknown): string | null => {
  if (typeof value !== "string" || !value.trim()) return null;
  const match = value.match(/\d{4}-\d{2}-\d{2}/);
  if (match) return match[0];
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString().slice(0, 10) : null;
};

const ticker = (value: unknown): string =>
  typeof value === "string" ? value.trim().toUpperCase().replace(/\./g, "-") : "";

export function normalizeSp500Changes(raw: unknown, membershipSource = "fmp"): NormalizedSp500Change[] {
  if (!Array.isArray(raw)) return [];
  const out: NormalizedSp500Change[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    const effectiveDate = isoDate(r.date ?? r.effectiveDate ?? r.effective_date);
    if (!effectiveDate) continue;
    const announcementDate = isoDate(r.announcementDate ?? r.announcement_date);
    const pairs = [
      { type: "addition" as const, symbol: r.symbol ?? r.addedTicker ?? r.addedSymbol, name: r.addedSecurity ?? r.companyName ?? r.name },
      { type: "deletion" as const, symbol: r.removedTicker ?? r.removedSymbol, name: r.removedSecurity },
    ];
    for (const p of pairs) {
      const symbol = ticker(p.symbol);
      if (!symbol) continue;
      const companyName = typeof p.name === "string" && p.name.trim() ? p.name.trim() : symbol;
      out.push({
        eventKey: `${effectiveDate}:${p.type}:${symbol}`,
        effectiveDate,
        announcementDate,
        changeType: p.type,
        symbol,
        companyName,
        membershipSource,
      });
    }
  }
  return Array.from(new Map(out.map(row => [row.eventKey, row])).values())
    .sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate));
}

async function getPublicSp500Changes(): Promise<NormalizedSp500Change[]> {
  const response = await axios.get("https://historyofmarket.com/api/sp500/changes.json", {
    timeout: 15_000,
    headers: { "User-Agent": "MarginOfSafetyCalculator/1.0 (constituent research)" },
  });
  const changes = Array.isArray(response.data?.changes) ? response.data.changes : [];
  const rows = changes.map((change: any) => ({
    effectiveDate: change.effectiveDate,
    symbol: change.addition?.ticker,
    addedSecurity: change.addition?.name,
    removedTicker: change.removal?.ticker,
    removedSecurity: change.removal?.name,
  }));
  return normalizeSp500Changes(rows, "S&P releases / History of Market");
}

export function mergeMembershipChanges(
  fmp: NormalizedSp500Change[],
  mirror: NormalizedSp500Change[],
): NormalizedSp500Change[] {
  // The FMP response can omit the removed ticker, so the complete public
  // replacement pairs form the base. FMP rows override matching keys where
  // it does provide a usable identifier and preserve FMP provenance.
  const merged = new Map(mirror.map(row => [row.eventKey, row]));
  for (const row of fmp) merged.set(row.eventKey, row);
  return Array.from(merged.values()).sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate));
}

async function fetchMembershipChanges(): Promise<NormalizedSp500Change[]> {
  // The release mirror is required for complete deletion identifiers. FMP's
  // historical payload often includes removedSecurity but no removed ticker.
  const mirror = await getPublicSp500Changes();
  if (mirror.length === 0) throw new Error("No valid S&P 500 constituent-change rows were available");
  try {
    const fmp = normalizeSp500Changes(await getHistoricalSp500Changes(), "FMP");
    if (fmp.length === 0) throw new Error("FMP returned no valid constituent-change rows");
    return mergeMembershipChanges(fmp, mirror);
  } catch (err) {
    console.warn("[S&P 500 changes] FMP history unavailable; using public S&P release mirror:", err instanceof Error ? err.message : err);
    return mirror;
  }
}

export function quarterForDate(date: string): string {
  const [year, month] = date.split("-").map(Number);
  return `${year} Q${Math.ceil(month / 3)}`;
}

export function evaluate(data: StockResponse): Sp500EvaluationSnapshot {
  const evaluatedAt = new Date().toISOString();
  const warnings = [...(data.appliedAdjustments ?? [])];
  if (data.crossSourceDivergence?.fields.length) warnings.push("Financial-data providers disagree");
  if (data.dataSource === "fallback") warnings.push("Static fallback data was used");
  if (!data.price || data.price <= 0 || !hasUsableQualityMetrics(data)) {
    return { status: "incomplete", evaluatedAt, price: data.price || null, intrinsicValue: null, discountPct: null, marginOfSafetyPct: null, quality: null, meetsBuyCriteria: false, reason: "Insufficient reliable financial data", dataSource: data.dataSource ?? "unknown", fetchedAt: data.fetchedAt ?? null, dataWarnings: warnings };
  }
  const quality = computeQuality(data);
  const broaderQuality = quality ?? (data.roe < 10 || data.debtToEquity > 2 || data.currentRatio < 1 ? "Speculative" : "Average");
  const intrinsicValue = estimateIntrinsicValue(data);
  const discountPct = intrinsicValue > 0 ? ((intrinsicValue - data.price) / intrinsicValue) * 100 : 0;
  const meets = !!quality && discountPct >= 10 && warnings.length === 0;
  const reason = warnings.length ? "Data quality needs review"
    : !quality ? `${broaderQuality} quality does not clear the Good threshold`
    : discountPct < 10 ? `Only ${Math.max(0, discountPct).toFixed(1)}% below estimated value; requires at least 10%`
    : `${quality} quality and ${discountPct.toFixed(1)}% below estimated value`;
  return {
    status: "complete", evaluatedAt, price: data.price, intrinsicValue: Number(intrinsicValue.toFixed(2)),
    discountPct: Number(discountPct.toFixed(1)), marginOfSafetyPct: Number(Math.max(0, discountPct).toFixed(1)),
    quality: broaderQuality, meetsBuyCriteria: meets, reason, dataSource: data.dataSource ?? "unknown",
    fetchedAt: data.fetchedAt ?? null, dataWarnings: warnings,
  };
}

const errorSnapshot = (message: string): Sp500EvaluationSnapshot => ({
  status: "error", evaluatedAt: new Date().toISOString(), price: null, intrinsicValue: null,
  discountPct: null, marginOfSafetyPct: null, quality: null, meetsBuyCriteria: false,
  reason: message, dataSource: "unknown", fetchedAt: null, dataWarnings: [],
});

let inFlight: Promise<{ newCount: number; checked: boolean; error?: string }> | null = null;

export function isSp500DailyCheckDue(lastCheckedDate: string | undefined, today: string): boolean {
  return lastCheckedDate !== today;
}

export async function syncSp500Changes(force = false, now = new Date()): Promise<{ newCount: number; checked: boolean; error?: string }> {
  const today = now.toISOString().slice(0, 10);
  const state = await storage.getSp500SyncState();
  if (!force && !isSp500DailyCheckDue(state?.lastCheckedDate, today)) return { newCount: 0, checked: false };
  if (inFlight) return inFlight;
  inFlight = (async () => {
    try {
      const events = await fetchMembershipChanges();
      const existing = new Set((await storage.listSp500Changes()).map(row => row.eventKey));
      // Initial import stays bounded: retain two years of event history and evaluate
      // only records not already snapshotted.
      const cutoff = new Date(now); cutoff.setUTCFullYear(cutoff.getUTCFullYear() - 2);
      // Bound each daily run so a large initial backfill cannot monopolize the
      // stock-data providers. Newest events are captured first; later daily
      // checks continue the backfill in batches.
      const pending = events
        .filter(e => !existing.has(e.eventKey) && e.effectiveDate >= cutoff.toISOString().slice(0, 10))
        .slice(0, 12);
      let newCount = 0;
      for (const event of pending) {
        let snapshot: Sp500EvaluationSnapshot;
        try { snapshot = evaluate(await getStockData(event.symbol)); }
        catch (err) { snapshot = errorSnapshot(err instanceof Error ? err.message : "Evaluation failed"); }
        const result = await storage.insertSp500Change({ ...event, snapshot });
        if (result.inserted) newCount++;
      }
      await storage.setSp500SyncState(today, now);
      return { newCount, checked: true };
    } catch (err) {
      return { newCount: 0, checked: true, error: err instanceof Error ? err.message : "S&P 500 refresh failed" };
    } finally { inFlight = null; }
  })();
  return inFlight;
}

export async function getSp500ChangesResponse() {
  const [changes, state] = await Promise.all([storage.listSp500Changes(), storage.getSp500SyncState()]);
  const grouped = new Map<string, Sp500ChangeRow[]>();
  for (const row of changes) {
    const quarter = quarterForDate(row.effectiveDate);
    grouped.set(quarter, [...(grouped.get(quarter) ?? []), row]);
  }
  return {
    quarters: Array.from(grouped.entries()).sort(([a], [b]) => b.localeCompare(a)).map(([quarter, rows]) => ({ quarter, changes: rows })),
    lastCheckedAt: state?.lastCheckedAt?.toISOString() ?? null,
  };
}