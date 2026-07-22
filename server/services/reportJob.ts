// Background engine for the emailed Russell 3000 research report (Task #57).
//
// Design constraints (from the task spec):
// - DELIBERATELY SLOW: one ticker every TICKER_PACE_MS (6s) so a full run
//   takes ~5 hours and never hammers the free-tier upstream APIs.
// - RESUMABLE: every scanned ticker is persisted as a result row before the
//   next fetch starts. The count of persisted rows is the cursor into the
//   FIXED-ORDER Russell 3000 list (this scan never shuffles). On boot,
//   resumeReportJobsOnBoot() picks up any queued/running job and continues
//   from the checkpoint — it never starts over.
// - NEVER ABORTS ON A BAD TICKER: fetch failures are recorded as 'failed'
//   rows (they appear in the CSV) and the scan moves on.
// - EMAIL FAILURE ≠ JOB FAILURE: if the scan finishes but the email can't be
//   sent, status becomes 'email_failed' and the CSV stays downloadable.

import { storage } from "../storage";
import { getStockData } from "./stockData";
import { RUSSELL_3000, type Russell3000Entry } from "../data/russell3000";
import type { InsertReportJobResult, ReportJob, ReportJobResult, ReportJobStatusPayload } from "@shared/schema";
import {
  computeQuality,
  hasUsableQualityMetrics,
  estimateIntrinsicValue,
} from "./researchScan";
import { buildReportCsv, reportCsvFilename } from "./reportCsv";
import { sendReportEmail, type ReportEmailSummary } from "./reportEmail";

export const TICKER_PACE_MS = 6_000;
// Must be LONGER than any single adapter tier's own timeout (Alpha Vantage
// and FMP use 15s axios timeouts; the yfinance subprocess can take several
// seconds cold), otherwise merely-slow tickers get falsely recorded as
// failed. Pacing (6s sleep) dominates total runtime regardless.
export const PER_TICKER_TIMEOUT_MS = 30_000;
// Same bar as the on-page quick scan: quality tier assigned AND ≥10% discount.
export const BUY_DISCOUNT_THRESHOLD_PCT = 10;
export const MAX_EMAIL_CANDIDATES = 10;

// Single-runner guard (per process). The DB-side guard is getActiveReportJob
// in the POST route; this flag stops a resume hook and a fresh request from
// double-driving the same job inside one process.
let runnerActive = false;

export function isReportRunnerActive(): boolean {
  return runnerActive;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    promise.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); },
    );
  });
}

// Scan one ticker into an insertable result row. Never throws.
export async function scanTickerForReport(
  jobId: number,
  entry: Russell3000Entry,
): Promise<InsertReportJobResult> {
  try {
    const data = await withTimeout(
      getStockData(entry.symbol),
      PER_TICKER_TIMEOUT_MS,
      entry.symbol,
    );
    if (!data || data.error || !data.price || data.price <= 0) {
      return {
        jobId,
        symbol: entry.symbol,
        name: entry.name,
        status: "failed",
        dataSource: data?.dataSource ?? null,
        fundamentalsComplete: false,
        quality: null,
        price: data?.price ?? null,
        intrinsicValue: null,
        discountPct: null,
        error: data?.error
          ? "Source flagged the response as an error"
          : "No price data returned",
      };
    }

    const fundamentalsComplete = hasUsableQualityMetrics(data);
    const quality = fundamentalsComplete ? computeQuality(data) : null;
    const intrinsicValue = estimateIntrinsicValue(data);
    const hasIv = Number.isFinite(intrinsicValue) && intrinsicValue > 0;
    const discountPct = hasIv ? ((intrinsicValue - data.price) / intrinsicValue) * 100 : null;

    return {
      jobId,
      symbol: entry.symbol,
      name: data.name || entry.name,
      status: "ok",
      dataSource: data.dataSource ?? null,
      fundamentalsComplete,
      quality,
      price: data.price,
      intrinsicValue: hasIv ? intrinsicValue : null,
      discountPct,
      error: null,
    };
  } catch (err) {
    return {
      jobId,
      symbol: entry.symbol,
      name: entry.name,
      status: "failed",
      dataSource: null,
      fundamentalsComplete: false,
      quality: null,
      price: null,
      intrinsicValue: null,
      discountPct: null,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export function summarizeResults(results: ReportJobResult[]): ReportEmailSummary {
  const ok = results.filter((r) => r.status === "ok");
  const buyCandidates = ok
    .filter(
      (r) =>
        r.quality !== null &&
        r.discountPct !== null &&
        r.discountPct >= BUY_DISCOUNT_THRESHOLD_PCT,
    )
    .sort((a, b) => (b.discountPct ?? 0) - (a.discountPct ?? 0))
    .slice(0, MAX_EMAIL_CANDIDATES)
    .map((r) => ({
      symbol: r.symbol,
      name: r.name,
      quality: r.quality,
      price: r.price,
      intrinsicValue: r.intrinsicValue,
      discountPct: r.discountPct,
    }));
  return {
    scanned: results.length,
    ok: ok.length,
    failed: results.length - ok.length,
    buyCandidates,
  };
}

async function finishJob(job: ReportJob): Promise<void> {
  const completedAt = new Date();
  const results = await storage.listReportJobResults(job.id);
  const summary = summarizeResults(results);
  const csv = buildReportCsv({ ...job, completedAt }, results);
  try {
    await sendReportEmail({ ...job, completedAt }, summary, csv, reportCsvFilename({ ...job, completedAt }));
    await storage.updateReportJob(job.id, { status: "sent", completedAt, emailedAt: new Date() });
    console.log(`[report-job] job ${job.id} complete — email sent to ${maskEmail(job.email)}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await storage.updateReportJob(job.id, { status: "email_failed", completedAt, error: message });
    console.error(`[report-job] job ${job.id} scan complete but email failed: ${message}`);
  }
}

async function runJob(job: ReportJob): Promise<void> {
  runnerActive = true;
  try {
    await storage.updateReportJob(job.id, { status: "running" });

    // Resume checkpoint: rows already persisted → index into the fixed list.
    let index = await storage.countReportJobResults(job.id);
    if (index > 0) {
      console.log(`[report-job] resuming job ${job.id} at ticker ${index + 1}/${RUSSELL_3000.length}`);
    } else {
      console.log(`[report-job] starting job ${job.id} — ${RUSSELL_3000.length} tickers at ${TICKER_PACE_MS / 1000}s pace`);
    }

    for (; index < RUSSELL_3000.length; index++) {
      const row = await scanTickerForReport(job.id, RUSSELL_3000[index]);
      await storage.addReportJobResult(row);
      if (index < RUSSELL_3000.length - 1) {
        await sleep(TICKER_PACE_MS);
      }
    }

    await finishJob(job);
  } catch (err) {
    // Only storage-level failures land here (scan errors are per-row).
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[report-job] job ${job.id} failed: ${message}`);
    try {
      await storage.updateReportJob(job.id, { status: "failed", error: message, completedAt: new Date() });
    } catch {
      // Storage is down — nothing more we can do; resume hook retries on boot.
    }
  } finally {
    runnerActive = false;
    // Close the TOCTOU gap: two near-simultaneous POSTs can both pass the
    // route's active-job check, creating a second queued job whose kick
    // no-oped against the single-runner guard. Without this sweep it would
    // strand forever (409ing everyone) until a restart.
    void pickUpQueuedSuccessor(job.id);
  }
}

async function pickUpQueuedSuccessor(finishedJobId: number): Promise<void> {
  try {
    const next = await storage.getActiveReportJob();
    // The id guard prevents an infinite self-loop if the finished job's
    // final status update failed and it still reads as running.
    if (next && next.id !== finishedJobId) {
      console.log(`[report-job] picking up queued job ${next.id} left behind by a concurrent request`);
      kickReportRunner(next);
    }
  } catch (err) {
    console.error("[report-job] queued-successor sweep failed:", err);
  }
}

// Fire-and-forget kick. Both the POST route (new job) and the boot hook
// (resume) funnel through here so the single-runner guard is authoritative.
export function kickReportRunner(job: ReportJob): void {
  if (runnerActive) {
    console.log(`[report-job] runner already active — job ${job.id} stays queued and will be swept up when the current run finishes`);
    return;
  }
  void runJob(job);
}

// Called once from server/index.ts after routes are registered. Fire and
// forget — boot must never block on (or crash from) report recovery.
export async function resumeReportJobsOnBoot(): Promise<void> {
  try {
    const active = await storage.getActiveReportJob();
    if (active) {
      console.log(`[report-job] found interrupted job ${active.id} (status=${active.status}) — resuming`);
      kickReportRunner(active);
    }
  } catch (err) {
    console.error("[report-job] resume-on-boot check failed:", err);
  }
}

// ---------------------------------------------------------------------------
// Status helpers shared with the routes layer
// ---------------------------------------------------------------------------

// The status endpoint is unauthenticated and global, so never echo the full
// address back: "jane.doe@example.com" → "j******e@example.com".
export function maskEmail(email: string): string {
  const at = email.indexOf("@");
  if (at <= 0) return "***";
  const local = email.slice(0, at);
  const domain = email.slice(at);
  if (local.length <= 2) return local[0] + "***" + domain;
  return local[0] + "*".repeat(Math.max(local.length - 2, 3)) + local[local.length - 1] + domain;
}

export async function toStatusPayload(job: ReportJob): Promise<ReportJobStatusPayload> {
  const scanned = await storage.countReportJobResults(job.id);
  return {
    id: job.id,
    status: job.status,
    scanned,
    total: job.totalTickers,
    maskedEmail: maskEmail(job.email),
    listAsOf: job.listAsOf,
    createdAt: (job.createdAt instanceof Date ? job.createdAt : new Date(job.createdAt)).toISOString(),
    completedAt: job.completedAt
      ? (job.completedAt instanceof Date ? job.completedAt : new Date(job.completedAt)).toISOString()
      : null,
  };
}
