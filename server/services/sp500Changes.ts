import type { Sp500ChangeRow, Sp500EvaluationRevisionRow, Sp500EvaluationSnapshot, StockResponse } from "@shared/schema";
import { storage } from "../storage";
import { getHistoricalSp500Changes } from "./fmpFinance";
import { getStockData } from "./stockData";
import { estimateIntrinsicValue, hasUsableQualityMetrics } from "./researchScan";
import { evaluateCompanyQuality, isResearchQuality } from "@shared/companyQuality";
import axios from "axios";
import { randomUUID } from "node:crypto";

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
  const qualityEvaluation = evaluateCompanyQuality(data);
  const broaderQuality = qualityEvaluation.quality;
  const intrinsicValue = estimateIntrinsicValue(data);
  const discountPct = intrinsicValue > 0 ? ((intrinsicValue - data.price) / intrinsicValue) * 100 : 0;
  const meets = isResearchQuality(broaderQuality) && discountPct >= 10 && warnings.length === 0;
  const valuationReason = discountPct < 0
    ? `Price is ${Math.abs(discountPct).toFixed(1)}% above estimated value`
    : `Only ${discountPct.toFixed(1)}% below estimated value; requires at least 10%`;
  const reason = discountPct < 0 ? `${valuationReason}${warnings.length ? "; data quality also needs review" : ""}`
    : warnings.length ? "Data quality needs review"
    : !isResearchQuality(broaderQuality) ? `${broaderQuality} quality does not clear the Good threshold`
    : discountPct < 10 ? valuationReason
    : `${broaderQuality} quality and ${discountPct.toFixed(1)}% below estimated value`;
  return {
    status: "complete", evaluatedAt, price: data.price, intrinsicValue: Number(intrinsicValue.toFixed(2)),
    discountPct: Number(discountPct.toFixed(1)), marginOfSafetyPct: Number(Math.max(0, discountPct).toFixed(1)),
    quality: broaderQuality, qualityVersion: qualityEvaluation.version, qualityReasons: qualityEvaluation.reasons,
    meetsBuyCriteria: meets, reason, dataSource: data.dataSource ?? "unknown",
    fetchedAt: data.fetchedAt ?? null, dataWarnings: warnings,
  };
}

export const SP500_CALCULATION_VERSION = 4;
export const SP500_LEGACY_CALCULATION_VERSION = 1;
const REVISION_BATCH_SIZE = 6;
const REFRESH_LEASE_MS = 45 * 60 * 1000;
const REFRESH_LEASE_HEARTBEAT_MS = 10 * 60 * 1000;
const LEASE_POLL_MS = 250;
const SP500_REFRESH_LEASE_TABLE = "sp500_refresh_leases";
const MISSING_SP500_REFRESH_LEASE_TABLE_MESSAGE =
  `S&P 500 refresh is unavailable because the "${SP500_REFRESH_LEASE_TABLE}" table is missing. ` +
  "Run the pending database migrations before retrying.";

function isMissingSp500RefreshLeaseTableError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: unknown; message?: unknown };
  if (typeof candidate.message !== "string") return false;
  const namesLeaseTable = new RegExp(
    `relation\\s+["']?${SP500_REFRESH_LEASE_TABLE}["']?\\s+does not exist`,
    "i",
  ).test(candidate.message);
  return namesLeaseTable && (candidate.code === undefined || candidate.code === "42P01");
}

function describeSp500RefreshError(error: unknown): string {
  if (isMissingSp500RefreshLeaseTableError(error)) {
    return MISSING_SP500_REFRESH_LEASE_TABLE_MESSAGE;
  }
  return error instanceof Error ? error.message : "S&P 500 refresh failed";
}

export function latestCompleteRevision(
  revisions: Sp500EvaluationRevisionRow[],
): Sp500EvaluationRevisionRow | undefined {
  return revisions
    .filter(revision => revision.snapshot.status === "complete")
    .sort((a, b) => b.calculationVersion - a.calculationVersion || b.createdAt.getTime() - a.createdAt.getTime())[0];
}

export function needsCurrentSp500Evaluation(revisions: Sp500EvaluationRevisionRow[]): boolean {
  return (latestCompleteRevision(revisions)?.calculationVersion ?? SP500_LEGACY_CALCULATION_VERSION) < SP500_CALCULATION_VERSION;
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

async function waitForSp500Refresh(date: string): Promise<"completed" | "expired"> {
  while (true) {
    const [state, lease] = await Promise.all([
      storage.getSp500SyncState(),
      storage.getSp500RefreshLease(date),
    ]);
    if (!lease) return state?.lastCheckedDate === date ? "completed" : "expired";
    const delay = lease.expiresAt.getTime() - Date.now();
    if (delay <= 0) return "expired";
    await new Promise(resolve => setTimeout(resolve, Math.min(LEASE_POLL_MS, delay)));
  }
}

async function runSp500Sync(force: boolean, now: Date): Promise<{ newCount: number; checked: boolean; error?: string }> {
  const today = now.toISOString().slice(0, 10);
  const state = await storage.getSp500SyncState();
  const membershipCheckDue = force || isSp500DailyCheckDue(state?.lastCheckedDate, today);
  const ownerToken = randomUUID();
  const leaseExpiresAt = new Date(Date.now() + REFRESH_LEASE_MS);
  const acquired = await storage.acquireSp500RefreshLease(today, ownerToken, leaseExpiresAt, new Date());
  if (!acquired) {
    const outcome = await waitForSp500Refresh(today);
    if (outcome === "expired") return runSp500Sync(force, new Date());
    return { newCount: 0, checked: false };
  }
  const heartbeat = setInterval(() => {
    void storage.renewSp500RefreshLease(
      today,
      ownerToken,
      new Date(Date.now() + REFRESH_LEASE_MS),
    ).catch(err => {
      console.error("[S&P 500 changes] Could not renew refresh lease:", err);
    });
  }, REFRESH_LEASE_HEARTBEAT_MS);
  heartbeat.unref();
  try {
       const storedChanges = await storage.listSp500Changes();
       const revisions = await storage.listSp500EvaluationRevisions();
       const existing = new Set(storedChanges.map(row => row.eventKey));
      let newCount = 0;
       if (membershipCheckDue) {
         const events = await fetchMembershipChanges();
         // Initial import stays bounded: retain two years of event history and evaluate
         // only records not already snapshotted.
         const cutoff = new Date(now); cutoff.setUTCFullYear(cutoff.getUTCFullYear() - 2);
         // Bound each daily run so a large initial backfill cannot monopolize the
         // stock-data providers. Newest events are captured first; later daily
         // checks continue the backfill in batches.
         const pending = events
           .filter(e => !existing.has(e.eventKey) && e.effectiveDate >= cutoff.toISOString().slice(0, 10))
           .slice(0, 12);
         for (const event of pending) {
           let snapshot: Sp500EvaluationSnapshot;
           try { snapshot = evaluate(await getStockData(event.symbol)); }
           catch (err) { snapshot = errorSnapshot(err instanceof Error ? err.message : "Evaluation failed"); }
           const result = await storage.insertSp500Change({ ...event, snapshot });
           if (result.inserted) {
             await storage.insertSp500EvaluationRevision(result.row.id, SP500_CALCULATION_VERSION, snapshot);
             newCount++;
           }
         }
       }
       const revisionsByChange = new Map<number, Sp500EvaluationRevisionRow[]>();
       for (const revision of revisions) {
         revisionsByChange.set(revision.changeId, [...(revisionsByChange.get(revision.changeId) ?? []), revision]);
       }
       const stale = storedChanges
         .filter(row => needsCurrentSp500Evaluation(revisionsByChange.get(row.id) ?? []))
         .sort((a, b) => {
           const aAttempted = (revisionsByChange.get(a.id) ?? []).some(r => r.calculationVersion === SP500_CALCULATION_VERSION);
           const bAttempted = (revisionsByChange.get(b.id) ?? []).some(r => r.calculationVersion === SP500_CALCULATION_VERSION);
           return Number(aAttempted) - Number(bAttempted) || b.effectiveDate.localeCompare(a.effectiveDate);
         })
         .slice(0, REVISION_BATCH_SIZE);
       for (const row of stale) {
         const prior = revisionsByChange.get(row.id) ?? [];
         if (prior.length === 0) {
           await storage.insertSp500EvaluationRevision(row.id, SP500_LEGACY_CALCULATION_VERSION, row.snapshot);
         }
         let snapshot: Sp500EvaluationSnapshot;
         try { snapshot = evaluate(await getStockData(row.symbol)); }
         catch (err) { snapshot = errorSnapshot(err instanceof Error ? err.message : "Evaluation failed"); }
         await storage.insertSp500EvaluationRevision(row.id, SP500_CALCULATION_VERSION, snapshot);
       }
       if (membershipCheckDue) await storage.setSp500SyncState(today, now);
       return { newCount, checked: membershipCheckDue || stale.length > 0 };
  } catch (err) {
    return { newCount: 0, checked: true, error: err instanceof Error ? err.message : "S&P 500 refresh failed" };
  } finally {
    clearInterval(heartbeat);
    try {
      await storage.releaseSp500RefreshLease(today, ownerToken);
    } catch (err) {
      console.error("[S&P 500 changes] Could not release refresh lease:", err);
    }
  }
}

export async function syncSp500Changes(force = false, now = new Date()): Promise<{ newCount: number; checked: boolean; error?: string }> {
  if (inFlight) return inFlight;
  const operation = runSp500Sync(force, now);
  inFlight = operation;
  try {
    return await operation;
  } catch (err) {
    const message = describeSp500RefreshError(err);
    if (isMissingSp500RefreshLeaseTableError(err)) {
      console.error(`[S&P 500 changes] Refresh coordination unavailable: the "${SP500_REFRESH_LEASE_TABLE}" table is missing. Run the pending database migrations.`, err);
    } else {
      console.error("[S&P 500 changes] Refresh coordination failed:", err);
    }
    return { newCount: 0, checked: false, error: message };
  } finally {
    if (inFlight === operation) inFlight = null;
  }
}

export async function getSp500ChangesResponse() {
  const [storedChanges, revisions, state] = await Promise.all([
    storage.listSp500Changes(),
    storage.listSp500EvaluationRevisions(),
    storage.getSp500SyncState(),
  ]);
  const byChange = new Map<number, Sp500EvaluationRevisionRow[]>();
  for (const revision of revisions) {
    byChange.set(revision.changeId, [...(byChange.get(revision.changeId) ?? []), revision]);
  }
  const changes = storedChanges.map(row => {
    const active = latestCompleteRevision(byChange.get(row.id) ?? []);
    return {
      ...row,
      snapshot: active?.snapshot ?? row.snapshot,
      evaluationRevision: active ? {
        calculationVersion: active.calculationVersion,
        revised: active.calculationVersion > SP500_LEGACY_CALCULATION_VERSION,
        originalEvaluatedAt: row.snapshot.evaluatedAt,
      } : {
        calculationVersion: SP500_LEGACY_CALCULATION_VERSION,
        revised: false,
        originalEvaluatedAt: row.snapshot.evaluatedAt,
      },
    };
  });
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