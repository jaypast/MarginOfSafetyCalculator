import { pgTable, text, serial, integer, boolean, decimal, varchar, timestamp, jsonb, doublePrecision, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

// Stock data schema
export const stocks = pgTable("stocks", {
  id: serial("id").primaryKey(),
  symbol: varchar("symbol", { length: 10 }).notNull().unique(),
  name: text("name").notNull(),
  price: decimal("price", { precision: 10, scale: 2 }).notNull(),
  eps: decimal("eps", { precision: 10, scale: 2 }).notNull(),
  peRatio: decimal("pe_ratio", { precision: 10, scale: 2 }).notNull(),
  fcfPerShare: decimal("fcf_per_share", { precision: 10, scale: 2 }).notNull(),
  growthRate: decimal("growth_rate", { precision: 6, scale: 2 }).notNull(),
  roe: decimal("roe", { precision: 6, scale: 2 }).notNull(),
  debtToEquity: decimal("debt_to_equity", { precision: 6, scale: 2 }).notNull(),
  currentRatio: decimal("current_ratio", { precision: 6, scale: 2 }).notNull(),
  revenueGrowth: decimal("revenue_growth", { precision: 6, scale: 2 }).notNull(),
  earningsStability: text("earnings_stability").notNull(),
  competitivePosition: text("competitive_position").notNull(),
  lastUpdated: text("last_updated").notNull(),
});

export const insertStockSchema = createInsertSchema(stocks).omit({
  id: true,
});

export type InsertStock = z.infer<typeof insertStockSchema>;
export type Stock = typeof stocks.$inferSelect;

// Recognised upstream data sources (in priority order). Used so the client can
// surface provenance — e.g. "this came from yfinance, fetched 8 minutes ago".
export const DATA_SOURCES = [
  'yfinance',
  'rapidapi',
  'alphavantage',
  'fmp',
  'scraper',
  'fallback',
  'unknown',
] as const;
export type DataSource = (typeof DATA_SOURCES)[number];

// Cross-source divergence — emitted when a background spot-check between two
// upstream sources finds at least one comparable field (price/EPS/PE/FCF/
// growthRate) that differs by more than the configured tolerance (15%).
export const crossSourceDivergenceSchema = z.object({
  checkedAt: z.string(), // ISO timestamp of when the spot-check finished
  sourceA: z.enum(DATA_SOURCES),
  sourceB: z.enum(DATA_SOURCES),
  fields: z.array(
    z.object({
      field: z.string(),
      valueA: z.number(),
      valueB: z.number(),
      deltaPct: z.number(),
    }),
  ),
});
export type CrossSourceDivergence = z.infer<typeof crossSourceDivergenceSchema>;

// Historical P/E block (Task #15). `fiveYearAvg` and `tenYearAvg` are the
// median of trailing-twelve-month P/E ratios computed at quarter ends over
// the trailing 20 / 40 quarters; quarters with non-positive EPS are skipped.
// `industryAvg` is a published per-sector median P/E (S&P sector medians)
// used as a sanity baseline. Each field is independently nullable so an
// adapter with partial coverage can return what it has.
export const peHistorySchema = z.object({
  fiveYearAvg: z.number().nullable(),
  tenYearAvg: z.number().nullable(),
  industryAvg: z.number().nullable(),
});
export type PeHistory = z.infer<typeof peHistorySchema>;

// Multibagger empirics block (Task #30). Each field is independently
// nullable so an adapter with partial coverage can return what it has.
//   - fcfYield: free-cash-flow yield, expressed as a *percent* (e.g.
//     5.2 means 5.2%). Yartseva (2025) Option A uses this as the
//     primary cash-quality gate: ≤0 blocks Buy→Watch, >5 promotes
//     borderline Watch→Buy.
//   - assetGrowth / ebitdaGrowth: YoY growth in *percent*. The
//     investment-affordability dummy fires when assetGrowth >
//     ebitdaGrowth — capital is being deployed faster than earnings
//     can support. Modifier chip only; never forces a Pass.
//   - week52High / week52Low: bounds of the trailing 52-week range,
//     in the same currency as ``price`` (the server converts both
//     when the listing currency != USD). The momentum chip fires
//     when current price is more than 80% of the way up the range.
export const multibaggerSignalsSchema = z.object({
  fcfYield: z.number().nullable(),
  assetGrowth: z.number().nullable(),
  ebitdaGrowth: z.number().nullable(),
  week52High: z.number().nullable(),
  week52Low: z.number().nullable(),
});
export type MultibaggerSignals = z.infer<typeof multibaggerSignalsSchema>;

// API Schemas
export const stockResponseSchema = z.object({
  symbol: z.string(),
  name: z.string(),
  price: z.number(),
  eps: z.number(),
  peRatio: z.number(),
  fcfPerShare: z.number(),
  growthRate: z.number(),
  roe: z.number(),
  debtToEquity: z.number(),
  currentRatio: z.number(),
  revenueGrowth: z.number(),
  earningsStability: z.string(),
  competitivePosition: z.string(),
  lastUpdated: z.string().optional(), // Date when the financial data was last updated
  // Provenance fields — populated by the server so the UI can render
  // a "data source · freshness" badge and warn when fallbacks were used.
  dataSource: z.enum(DATA_SOURCES).optional(),
  fetchedAt: z.string().optional(), // ISO timestamp of when the server returned this payload
  // Free-form notes about adjustments applied during normalization
  // (e.g. "EPS derived from price/PE", "FCF estimated as 0.75 × EPS").
  appliedAdjustments: z.array(z.string()).optional(),
  error: z.boolean().optional(),
  errorMessage: z.string().optional(),
  // Cross-source divergence — populated when a background spot-check
  // between two upstream sources flagged at least one comparable metric
  // exceeding the 15% tolerance. `null` means a spot-check ran and the
  // sources agreed; `undefined` means no spot-check has run yet.
  // (Append-only block — keep adjacent to other parallel-task additions.)
  crossSourceDivergence: crossSourceDivergenceSchema.nullable().optional(),
  // Historical P/E block (Task #15) — per-ticker trailing-twelve-month
  // medians computed from the upstream's quarterly EPS + price history,
  // plus an industry baseline. Each field is independently nullable so
  // adapters with partial coverage can return what they have. Adapters
  // without any historical visibility omit the field entirely.
  peHistory: peHistorySchema.nullable().optional(),
  // Multibagger empirics block (Task #30 — Yartseva 2025). Surfaced to
  // the Value-Investor Verdict's cash-quality gate (fcfYield primary
  // gate, Option A) and the two modifier chips (asset-growth >
  // EBITDA-growth investment-unaffordability dummy, and 52-week-range
  // momentum). Each field is independently nullable so adapters with
  // partial coverage can return what they have; the verdict component
  // skips any check whose inputs are missing rather than guessing.
  // Append-only block — keep adjacent to the other parallel-task
  // additions so future merges stay mechanical.
  multibaggerSignals: multibaggerSignalsSchema.nullable().optional(),
  // Market capitalisation in USD (Task #37). Used by the Multibagger
  // Screener's Size sub-score (Yartseva 2025 §6.3 TEV proxy). Each
  // adapter populates this when the upstream exposes it; others emit
  // null so the composite renormalises across the remaining factors.
  marketCap: z.number().nullable().optional(),
});

export type StockResponse = z.infer<typeof stockResponseSchema>;

// Fed rate environment (Task #31). A small macro-context badge driven
// by the FRED FEDFUNDS series. Append-only block to keep merges with
// other parallel tasks mechanical.
//   - environment: classification of the trailing 12-month change in
//     the Fed funds target rate. ≥ +50bp YoY = 'rising', ≤ −50bp YoY
//     = 'falling', otherwise 'stable'.
//   - currentRate / yearAgoRate: the underlying numbers (percent).
//   - deltaBp: 100 × (current - yearAgo), rounded to integer bps.
//   - asOf: ISO date of the latest observation used.
//   - source: which upstream produced the data ('fred' today; 'cache'
//     when serving an in-memory copy; 'unavailable' when the fetch
//     failed and no cache is available).
export const FED_RATE_ENVIRONMENTS = ['rising', 'stable', 'falling'] as const;
export type FedRateEnvironment = (typeof FED_RATE_ENVIRONMENTS)[number];

export const fedRateResponseSchema = z.object({
  environment: z.enum(FED_RATE_ENVIRONMENTS),
  currentRate: z.number(),
  yearAgoRate: z.number(),
  deltaBp: z.number(),
  asOf: z.string(),
  // 'fred' = served from a fresh upstream fetch; 'cache' = served from the
  // 24h in-memory cache (or a stale fallback after an upstream failure).
  // The route returns `{ environment: null }` instead of an "unavailable"
  // payload when the data is missing entirely, so the client can hide the
  // badge with a single null check.
  source: z.enum(['fred', 'cache']),
});
export type FedRateResponse = z.infer<typeof fedRateResponseSchema>;

// Sean Ellis Product-Market Fit feedback schema
export const feedback = pgTable("feedback", {
  id: serial("id").primaryKey(),
  satisfaction: text("satisfaction").notNull(), // "very disappointed", "somewhat disappointed", "not disappointed"
  mainBenefit: text("main_benefit"),
  improvements: text("improvements"),
  email: text("email"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertFeedbackSchema = createInsertSchema(feedback).omit({
  id: true,
  createdAt: true, 
});

export const feedbackResponseSchema = z.object({
  id: z.number(),
  satisfaction: z.string(),
  mainBenefit: z.string().nullable(),
  improvements: z.string().nullable(),
  email: z.string().nullable(),
  createdAt: z.date(),
});

export type InsertFeedback = z.infer<typeof insertFeedbackSchema>;
export type Feedback = typeof feedback.$inferSelect;

// =============================================================================
// Watchlist (Task #14)
//
// A persistent list of tickers the user is tracking, scoped by an opaque
// browser-set session cookie (no auth yet — per-user lists are a clean
// follow-up). Append-only block at the bottom of the file to keep merges
// with the parallel cross-source / historical-P/E tasks mechanical.
// =============================================================================
export const watchlist = pgTable("watchlist", {
  id: serial("id").primaryKey(),
  sessionId: varchar("session_id", { length: 64 }).notNull(),
  symbol: varchar("symbol", { length: 10 }).notNull(),
  // Margin-of-safety percent (whole-number percent). The calculator UI only
  // ever produces integers (20 / 30 / 35 / 45 / etc.), so an integer column
  // matches the data without needing any decimal conversion.
  marginOfSafety: integer("margin_of_safety").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Insert schema — sessionId and createdAt are filled in server-side, so the
// client only sends the user-controlled fields.
export const insertWatchlistEntrySchema = createInsertSchema(watchlist)
  .omit({ id: true, sessionId: true, createdAt: true })
  .extend({
    // Stricter than the column constraint: the API accepts any case but we
    // normalise to uppercase before persisting.
    symbol: z.string().min(1).max(10),
    marginOfSafety: z.number().int().min(0).max(95),
  });

export type InsertWatchlistEntry = z.infer<typeof insertWatchlistEntrySchema>;
export type WatchlistEntry = typeof watchlist.$inferSelect;

// Wire-format response — Date → ISO string so the client can render
// freshness without re-parsing.
export const watchlistEntryResponseSchema = z.object({
  id: z.number(),
  symbol: z.string(),
  marginOfSafety: z.number().int(),
  createdAt: z.string(),
});
export type WatchlistEntryResponse = z.infer<typeof watchlistEntryResponseSchema>;

// =============================================================================
// Fundamentals cache (Task #58)
//
// Persistent cache of the slow-changing parts of a StockResponse, keyed by
// symbol. Fundamentals only move quarterly, so a repeat lookup within the
// freshness window needs just a cheap live price fetch; the rest is served
// from this table. The full last-known-good payload is stored as JSONB so
// schema additions to StockResponse never require a cache migration —
// tier expiry logic (7-day fundamentals, 1-day 52-week range, 30-day
// P/E history) lives in the fetch pipeline, not the table.
//
// Append-only block at the bottom of the file to keep merges mechanical.
// =============================================================================
export const fundamentalsCache = pgTable("fundamentals_cache", {
  id: serial("id").primaryKey(),
  symbol: varchar("symbol", { length: 10 }).notNull().unique(),
  // Last complete payload returned by a live source (never the static
  // fallback and never an error response).
  payload: jsonb("payload").$type<StockResponse>().notNull(),
  // Which upstream produced the payload — preserved so cached responses
  // keep an honest provenance badge.
  dataSource: text("data_source").notNull(),
  // When the payload was fetched from the live source. Cached responses
  // surface this (not "now") as their freshness timestamp.
  fetchedAt: timestamp("fetched_at").notNull(),
});

export const insertFundamentalsCacheSchema = createInsertSchema(fundamentalsCache).omit({
  id: true,
});

export type InsertFundamentalsCache = z.infer<typeof insertFundamentalsCacheSchema>;
export type FundamentalsCacheRow = typeof fundamentalsCache.$inferSelect;

// =============================================================================
// Emailed research report jobs (Task #57)
//
// A background job that scans the full Russell 3000 universe at a deliberately
// slow pace and emails the requester a summary + CSV when done. Progress is
// checkpointed to the database (one result row per ticker) so the job resumes
// from where it left off after a restart or redeploy — it never starts over.
//
// Checkpoint model: the count of persisted result rows for a job is the
// authoritative cursor into the *fixed-order* Russell 3000 list (the report
// scan never shuffles, unlike the quick on-page scan). The (jobId, symbol)
// unique constraint makes double-processing after a crash harmless.
//
// Append-only block at the bottom of the file to keep merges mechanical.
// =============================================================================
export const REPORT_JOB_STATUSES = [
  'queued',        // created, engine hasn't picked it up yet
  'running',       // scanning tickers
  'sent',          // scan complete and email delivered
  'email_failed',  // scan complete but email delivery failed (CSV still downloadable)
  'failed',        // unrecoverable engine error
] as const;
export type ReportJobStatus = (typeof REPORT_JOB_STATUSES)[number];

export const REPORT_RESULT_STATUSES = ['ok', 'failed'] as const;
export type ReportResultStatus = (typeof REPORT_RESULT_STATUSES)[number];

export const reportJobs = pgTable("report_jobs", {
  id: serial("id").primaryKey(),
  email: text("email").notNull(),
  status: text("status").$type<ReportJobStatus>().notNull().default('queued'),
  totalTickers: integer("total_tickers").notNull(),
  // As-of date of the bundled Russell 3000 constituent list — copied onto the
  // job (and into the CSV) so a regenerated list never rewrites history.
  listAsOf: text("list_as_of").notNull(),
  error: text("error"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
  emailedAt: timestamp("emailed_at"),
});

export const reportJobResults = pgTable("report_job_results", {
  id: serial("id").primaryKey(),
  jobId: integer("job_id").notNull().references(() => reportJobs.id),
  symbol: varchar("symbol", { length: 10 }).notNull(),
  name: text("name").notNull(),
  // 'failed' rows are recorded too — the CSV must cover every scanned company,
  // and the checkpoint counter must advance past tickers that error out.
  status: text("status").$type<ReportResultStatus>().notNull(),
  // Provenance: which upstream answered (yfinance/rapidapi/…/fallback), and
  // whether the fundamentals needed for quality scoring were all present.
  dataSource: text("data_source"),
  fundamentalsComplete: boolean("fundamentals_complete").notNull().default(false),
  quality: text("quality"),
  price: doublePrecision("price"),
  intrinsicValue: doublePrecision("intrinsic_value"),
  discountPct: doublePrecision("discount_pct"),
  error: text("error"),
}, (table) => [
  unique("report_job_results_job_symbol_unique").on(table.jobId, table.symbol),
]);

export const insertReportJobSchema = createInsertSchema(reportJobs).omit({
  id: true,
  createdAt: true,
});
export type InsertReportJob = z.infer<typeof insertReportJobSchema>;
export type ReportJob = typeof reportJobs.$inferSelect;

export const insertReportJobResultSchema = createInsertSchema(reportJobResults, {
  status: z.enum(REPORT_RESULT_STATUSES),
}).omit({
  id: true,
});
export type InsertReportJobResult = z.infer<typeof insertReportJobResultSchema>;
export type ReportJobResult = typeof reportJobResults.$inferSelect;

// Request body for POST /api/research/report — the only user-controlled field.
export const createReportRequestSchema = z.object({
  email: z.string().trim().email().max(254),
});
export type CreateReportRequest = z.infer<typeof createReportRequestSchema>;

// Wire format for GET /api/research/report/status. The email is masked
// because the status endpoint is global (no auth) — anyone can poll it.
export const reportJobStatusSchema = z.object({
  id: z.number(),
  status: z.enum(REPORT_JOB_STATUSES),
  scanned: z.number().int(),
  total: z.number().int(),
  maskedEmail: z.string(),
  listAsOf: z.string(),
  createdAt: z.string(),
  completedAt: z.string().nullable(),
});
export const reportStatusResponseSchema = z.object({
  job: reportJobStatusSchema.nullable(),
});
export type ReportJobStatusPayload = z.infer<typeof reportJobStatusSchema>;
export type ReportStatusResponse = z.infer<typeof reportStatusResponseSchema>;
