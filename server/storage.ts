import {
  users, type User, type InsertUser,
  feedback, type Feedback, type InsertFeedback,
  watchlist, type WatchlistEntry,
  fundamentalsCache, type FundamentalsCacheRow,
  reportJobs, type ReportJob,
  reportJobResults, type ReportJobResult, type InsertReportJobResult,
  type StockResponse,
} from "@shared/schema";
import { db } from "./db";
import { and, eq, desc, count, inArray } from "drizzle-orm";

export interface IStorage {
  // User methods
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  
  // Feedback methods
  createFeedback(feedbackData: InsertFeedback): Promise<Feedback>;
  getAllFeedback(): Promise<Feedback[]>;
  getFeedbackStats(): Promise<{
    totalResponses: number;
    veryDisappointed: number;
    somewhatDisappointed: number;
    notDisappointed: number;
    pmfScore: number;
  }>;

  // Watchlist methods (Task #14)
  // Returns the existing entry when (sessionId, symbol) already present so
  // the UI can be optimistic without worrying about duplicates.
  addWatchlistEntry(sessionId: string, symbol: string, marginOfSafety: number): Promise<WatchlistEntry>;
  listWatchlistEntries(sessionId: string): Promise<WatchlistEntry[]>;
  // Returns true when a row was deleted (so the route can return 404 for
  // attempts to delete entries belonging to a different session).
  removeWatchlistEntry(id: number, sessionId: string): Promise<boolean>;

  // Fundamentals cache methods (Task #58)
  // Persistent per-symbol cache of the last complete live payload so repeat
  // lookups only need a cheap price refresh. Symbol is always uppercased.
  getFundamentalsCache(symbol: string): Promise<FundamentalsCacheRow | undefined>;
  upsertFundamentalsCache(
    symbol: string,
    payload: StockResponse,
    dataSource: string,
    fetchedAt: Date,
  ): Promise<FundamentalsCacheRow>;

  // Report job methods (Task #57)
  // DB-backed background job for the emailed Russell 3000 report. The count
  // of persisted result rows is the resume checkpoint, so addReportJobResult
  // must tolerate duplicate (jobId, symbol) inserts (crash between insert and
  // the next fetch can replay one ticker).
  createReportJob(email: string, totalTickers: number, listAsOf: string): Promise<ReportJob>;
  getReportJob(id: number): Promise<ReportJob | undefined>;
  // Most recent job still in a live state (queued/running) — used both as the
  // duplicate-request guard and as the resume-on-boot lookup.
  getActiveReportJob(): Promise<ReportJob | undefined>;
  // Most recent job in any state — lets the UI keep showing "sent" after a
  // run completes.
  getLatestReportJob(): Promise<ReportJob | undefined>;
  updateReportJob(
    id: number,
    fields: Partial<Pick<ReportJob, "status" | "error" | "completedAt" | "emailedAt">>,
  ): Promise<ReportJob | undefined>;
  addReportJobResult(result: InsertReportJobResult): Promise<void>;
  countReportJobResults(jobId: number): Promise<number>;
  listReportJobResults(jobId: number): Promise<ReportJobResult[]>;
}

// Memory storage for fallback when database is not available.
// Exported so tests can exercise the same PMF math the runtime uses.
export class MemStorage implements IStorage {
  private users: User[] = [];
  private feedbackEntries: Feedback[] = [];
  private watchlistEntries: WatchlistEntry[] = [];
  private fundamentalsCacheRows: Map<string, FundamentalsCacheRow> = new Map();
  private reportJobRows: ReportJob[] = [];
  private reportJobResultRows: ReportJobResult[] = [];
  private nextUserId = 1;
  private nextFeedbackId = 1;
  private nextWatchlistId = 1;
  private nextFundamentalsCacheId = 1;
  private nextReportJobId = 1;
  private nextReportJobResultId = 1;
  
  // User methods
  async getUser(id: number): Promise<User | undefined> {
    return this.users.find(u => u.id === id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return this.users.find(u => u.username === username);
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const now = new Date();
    const user = {
      ...insertUser,
      id: this.nextUserId++,
      createdAt: now
    } as User;
    this.users.push(user);
    return user;
  }
  
  // Feedback methods
  async createFeedback(feedbackData: InsertFeedback): Promise<Feedback> {
    const now = new Date();
    const newFeedback = {
      ...feedbackData,
      id: this.nextFeedbackId++,
      createdAt: now
    } as Feedback;
    this.feedbackEntries.push(newFeedback);
    console.log("Created feedback:", newFeedback);
    return newFeedback;
  }
  
  async getAllFeedback(): Promise<Feedback[]> {
    return [...this.feedbackEntries].sort((a, b) => {
      const dateA = a.createdAt instanceof Date ? a.createdAt : new Date(a.createdAt || 0);
      const dateB = b.createdAt instanceof Date ? b.createdAt : new Date(b.createdAt || 0);
      return dateA.getTime() - dateB.getTime();
    });
  }
  
  async getFeedbackStats(): Promise<{
    totalResponses: number;
    veryDisappointed: number;
    somewhatDisappointed: number;
    notDisappointed: number;
    pmfScore: number;
  }> {
    const allFeedback = await this.getAllFeedback();
    const totalResponses = allFeedback.length;
    
    console.log("Feedback stats (memory storage) - total entries:", totalResponses);
    
    if (totalResponses === 0) {
      return {
        totalResponses: 0,
        veryDisappointed: 0,
        somewhatDisappointed: 0,
        notDisappointed: 0,
        pmfScore: 0
      };
    }
    
    const veryDisappointed = allFeedback.filter(f => f.satisfaction === 'very_disappointed').length;
    const somewhatDisappointed = allFeedback.filter(f => f.satisfaction === 'somewhat_disappointed').length;
    const notDisappointed = allFeedback.filter(f => f.satisfaction === 'not_disappointed').length;
    
    console.log(`Feedback counts (memory) - very: ${veryDisappointed}, somewhat: ${somewhatDisappointed}, not: ${notDisappointed}`);
    
    // Calculate PMF score (% of users who would be "very disappointed" without your product)
    const pmfScore = (veryDisappointed / totalResponses) * 100;
    
    return {
      totalResponses,
      veryDisappointed,
      somewhatDisappointed,
      notDisappointed,
      pmfScore
    };
  }

  // Watchlist methods --------------------------------------------------------
  async addWatchlistEntry(sessionId: string, symbol: string, marginOfSafety: number): Promise<WatchlistEntry> {
    const upper = symbol.toUpperCase();
    // Dedup on (sessionId, symbol) so re-adding the same ticker is a no-op
    // rather than creating noisy duplicate rows. The most recent MoS wins.
    const existing = this.watchlistEntries.find(e => e.sessionId === sessionId && e.symbol === upper);
    if (existing) {
      existing.marginOfSafety = marginOfSafety;
      return existing;
    }
    const entry: WatchlistEntry = {
      id: this.nextWatchlistId++,
      sessionId,
      symbol: upper,
      marginOfSafety,
      createdAt: new Date(),
    };
    this.watchlistEntries.push(entry);
    return entry;
  }

  async listWatchlistEntries(sessionId: string): Promise<WatchlistEntry[]> {
    return this.watchlistEntries
      .filter(e => e.sessionId === sessionId)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }

  async removeWatchlistEntry(id: number, sessionId: string): Promise<boolean> {
    const idx = this.watchlistEntries.findIndex(e => e.id === id && e.sessionId === sessionId);
    if (idx === -1) return false;
    this.watchlistEntries.splice(idx, 1);
    return true;
  }

  // Fundamentals cache methods --------------------------------------------
  async getFundamentalsCache(symbol: string): Promise<FundamentalsCacheRow | undefined> {
    return this.fundamentalsCacheRows.get(symbol.toUpperCase());
  }

  async upsertFundamentalsCache(
    symbol: string,
    payload: StockResponse,
    dataSource: string,
    fetchedAt: Date,
  ): Promise<FundamentalsCacheRow> {
    const upper = symbol.toUpperCase();
    const existing = this.fundamentalsCacheRows.get(upper);
    const row: FundamentalsCacheRow = {
      id: existing?.id ?? this.nextFundamentalsCacheId++,
      symbol: upper,
      payload,
      dataSource,
      fetchedAt,
    };
    this.fundamentalsCacheRows.set(upper, row);
    return row;
  }

  // Report job methods (Task #57) -------------------------------------------
  async createReportJob(email: string, totalTickers: number, listAsOf: string): Promise<ReportJob> {
    const job: ReportJob = {
      id: this.nextReportJobId++,
      email,
      status: 'queued',
      totalTickers,
      listAsOf,
      error: null,
      createdAt: new Date(),
      completedAt: null,
      emailedAt: null,
    };
    this.reportJobRows.push(job);
    return job;
  }

  async getReportJob(id: number): Promise<ReportJob | undefined> {
    return this.reportJobRows.find(j => j.id === id);
  }

  async getActiveReportJob(): Promise<ReportJob | undefined> {
    const live = this.reportJobRows.filter(j => j.status === 'queued' || j.status === 'running');
    return live.length > 0 ? live[live.length - 1] : undefined;
  }

  async getLatestReportJob(): Promise<ReportJob | undefined> {
    return this.reportJobRows.length > 0
      ? this.reportJobRows[this.reportJobRows.length - 1]
      : undefined;
  }

  async updateReportJob(
    id: number,
    fields: Partial<Pick<ReportJob, "status" | "error" | "completedAt" | "emailedAt">>,
  ): Promise<ReportJob | undefined> {
    const job = this.reportJobRows.find(j => j.id === id);
    if (!job) return undefined;
    Object.assign(job, fields);
    return job;
  }

  async addReportJobResult(result: InsertReportJobResult): Promise<void> {
    // Mirror the DB's (jobId, symbol) unique constraint: replays are no-ops.
    const exists = this.reportJobResultRows.some(
      r => r.jobId === result.jobId && r.symbol === result.symbol,
    );
    if (exists) return;
    this.reportJobResultRows.push({
      id: this.nextReportJobResultId++,
      jobId: result.jobId,
      symbol: result.symbol,
      name: result.name,
      status: result.status,
      dataSource: result.dataSource ?? null,
      fundamentalsComplete: result.fundamentalsComplete ?? false,
      quality: result.quality ?? null,
      price: result.price ?? null,
      intrinsicValue: result.intrinsicValue ?? null,
      discountPct: result.discountPct ?? null,
      error: result.error ?? null,
    });
  }

  async countReportJobResults(jobId: number): Promise<number> {
    return this.reportJobResultRows.filter(r => r.jobId === jobId).length;
  }

  async listReportJobResults(jobId: number): Promise<ReportJobResult[]> {
    return this.reportJobResultRows
      .filter(r => r.jobId === jobId)
      .sort((a, b) => a.id - b.id);
  }
}

export class DatabaseStorage implements IStorage {
  // User methods
  async getUser(id: number): Promise<User | undefined> {
    if (!db) {
      console.log("Database not available - using memory storage fallback");
      return undefined;
    }
    
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    if (!db) {
      console.log("Database not available - using memory storage fallback");
      return undefined;
    }
    
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user || undefined;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    if (!db) {
      console.log("Database not available - using memory storage fallback");
      throw new Error("Database connection not available");
    }
    
    const [user] = await db
      .insert(users)
      .values(insertUser)
      .returning();
    return user;
  }
  
  // Feedback methods
  async createFeedback(feedbackData: InsertFeedback): Promise<Feedback> {
    if (!db) {
      console.log("Database not available - using memory storage fallback");
      throw new Error("Database connection not available");
    }
    
    const [newFeedback] = await db
      .insert(feedback)
      .values(feedbackData)
      .returning();
    return newFeedback;
  }
  
  async getAllFeedback(): Promise<Feedback[]> {
    if (!db) {
      console.log("Database not available - using memory storage fallback");
      return [];
    }
    
    const allFeedback = await db
      .select()
      .from(feedback)
      .orderBy(feedback.createdAt);
    return allFeedback;
  }
  
  async getFeedbackStats(): Promise<{
    totalResponses: number;
    veryDisappointed: number;
    somewhatDisappointed: number;
    notDisappointed: number;
    pmfScore: number;
  }> {
    if (!db) {
      console.log("Database not available - using memory storage fallback");
      return {
        totalResponses: 0,
        veryDisappointed: 0,
        somewhatDisappointed: 0,
        notDisappointed: 0,
        pmfScore: 0
      };
    }
    
    const allFeedback = await this.getAllFeedback();
    const totalResponses = allFeedback.length;
    
    console.log("Feedback stats - all feedback:", JSON.stringify(allFeedback));
    
    if (totalResponses === 0) {
      return {
        totalResponses: 0,
        veryDisappointed: 0,
        somewhatDisappointed: 0,
        notDisappointed: 0,
        pmfScore: 0
      };
    }
    
    const veryDisappointed = allFeedback.filter(f => f.satisfaction === 'very_disappointed').length;
    const somewhatDisappointed = allFeedback.filter(f => f.satisfaction === 'somewhat_disappointed').length;
    const notDisappointed = allFeedback.filter(f => f.satisfaction === 'not_disappointed').length;
    
    console.log(`Feedback counts - very: ${veryDisappointed}, somewhat: ${somewhatDisappointed}, not: ${notDisappointed}`);
    
    // Calculate PMF score (% of users who would be "very disappointed" without your product)
    const pmfScore = (veryDisappointed / totalResponses) * 100;
    
    return {
      totalResponses,
      veryDisappointed,
      somewhatDisappointed,
      notDisappointed,
      pmfScore
    };
  }

  // Watchlist methods --------------------------------------------------------
  async addWatchlistEntry(sessionId: string, symbol: string, marginOfSafety: number): Promise<WatchlistEntry> {
    if (!db) throw new Error("Database connection not available");
    const upper = symbol.toUpperCase();
    // Dedup at the application layer (no unique constraint in the schema yet).
    // The most recent MoS wins so re-adding behaves as an "update".
    const existing = await db
      .select()
      .from(watchlist)
      .where(and(eq(watchlist.sessionId, sessionId), eq(watchlist.symbol, upper)));
    if (existing.length > 0) {
      const [updated] = await db
        .update(watchlist)
        .set({ marginOfSafety })
        .where(eq(watchlist.id, existing[0].id))
        .returning();
      return updated;
    }
    const [entry] = await db
      .insert(watchlist)
      .values({ sessionId, symbol: upper, marginOfSafety })
      .returning();
    return entry;
  }

  async listWatchlistEntries(sessionId: string): Promise<WatchlistEntry[]> {
    if (!db) return [];
    return await db
      .select()
      .from(watchlist)
      .where(eq(watchlist.sessionId, sessionId))
      .orderBy(watchlist.createdAt);
  }

  async removeWatchlistEntry(id: number, sessionId: string): Promise<boolean> {
    if (!db) return false;
    const result = await db
      .delete(watchlist)
      .where(and(eq(watchlist.id, id), eq(watchlist.sessionId, sessionId)))
      .returning({ id: watchlist.id });
    return result.length > 0;
  }

  // Fundamentals cache methods --------------------------------------------
  async getFundamentalsCache(symbol: string): Promise<FundamentalsCacheRow | undefined> {
    if (!db) return undefined;
    const [row] = await db
      .select()
      .from(fundamentalsCache)
      .where(eq(fundamentalsCache.symbol, symbol.toUpperCase()));
    return row || undefined;
  }

  async upsertFundamentalsCache(
    symbol: string,
    payload: StockResponse,
    dataSource: string,
    fetchedAt: Date,
  ): Promise<FundamentalsCacheRow> {
    if (!db) throw new Error("Database connection not available");
    const upper = symbol.toUpperCase();
    const [row] = await db
      .insert(fundamentalsCache)
      .values({ symbol: upper, payload, dataSource, fetchedAt })
      .onConflictDoUpdate({
        target: fundamentalsCache.symbol,
        set: { payload, dataSource, fetchedAt },
      })
      .returning();
    return row;
  }

  // Report job methods (Task #57) -------------------------------------------
  async createReportJob(email: string, totalTickers: number, listAsOf: string): Promise<ReportJob> {
    if (!db) throw new Error("Database connection not available");
    const [job] = await db
      .insert(reportJobs)
      .values({ email, totalTickers, listAsOf, status: 'queued' })
      .returning();
    return job;
  }

  async getReportJob(id: number): Promise<ReportJob | undefined> {
    if (!db) return undefined;
    const [job] = await db.select().from(reportJobs).where(eq(reportJobs.id, id));
    return job || undefined;
  }

  async getActiveReportJob(): Promise<ReportJob | undefined> {
    if (!db) return undefined;
    const [job] = await db
      .select()
      .from(reportJobs)
      .where(inArray(reportJobs.status, ['queued', 'running']))
      .orderBy(desc(reportJobs.id))
      .limit(1);
    return job || undefined;
  }

  async getLatestReportJob(): Promise<ReportJob | undefined> {
    if (!db) return undefined;
    const [job] = await db
      .select()
      .from(reportJobs)
      .orderBy(desc(reportJobs.id))
      .limit(1);
    return job || undefined;
  }

  async updateReportJob(
    id: number,
    fields: Partial<Pick<ReportJob, "status" | "error" | "completedAt" | "emailedAt">>,
  ): Promise<ReportJob | undefined> {
    if (!db) throw new Error("Database connection not available");
    const [job] = await db
      .update(reportJobs)
      .set(fields)
      .where(eq(reportJobs.id, id))
      .returning();
    return job || undefined;
  }

  async addReportJobResult(result: InsertReportJobResult): Promise<void> {
    if (!db) throw new Error("Database connection not available");
    // Duplicate (jobId, symbol) replays after a crash are harmless no-ops.
    await db.insert(reportJobResults).values(result).onConflictDoNothing();
  }

  async countReportJobResults(jobId: number): Promise<number> {
    if (!db) return 0;
    const [row] = await db
      .select({ value: count() })
      .from(reportJobResults)
      .where(eq(reportJobResults.jobId, jobId));
    return row?.value ?? 0;
  }

  async listReportJobResults(jobId: number): Promise<ReportJobResult[]> {
    if (!db) return [];
    return await db
      .select()
      .from(reportJobResults)
      .where(eq(reportJobResults.jobId, jobId))
      .orderBy(reportJobResults.id);
  }
}

// Handle the case when errors occur with the database storage
class SafeStorageWrapper implements IStorage {
  private memStorage = new MemStorage();
  private dbStorage: DatabaseStorage | null = null;
  
  constructor() {
    if (db) {
      try {
        this.dbStorage = new DatabaseStorage();
      } catch (err) {
        console.error("Failed to initialize database storage:", err);
        this.dbStorage = null;
      }
    }
    
    console.log(`Using ${this.dbStorage ? 'database' : 'memory'} storage for the application`);
  }
  
  // Forward all methods to either database or memory storage
  async getUser(id: number): Promise<User | undefined> {
    try {
      if (this.dbStorage) {
        return await this.dbStorage.getUser(id);
      }
    } catch (err) {
      console.error("Database error in getUser, falling back to memory storage:", err);
    }
    return this.memStorage.getUser(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    try {
      if (this.dbStorage) {
        return await this.dbStorage.getUserByUsername(username);
      }
    } catch (err) {
      console.error("Database error in getUserByUsername, falling back to memory storage:", err);
    }
    return this.memStorage.getUserByUsername(username);
  }

  async createUser(user: InsertUser): Promise<User> {
    try {
      if (this.dbStorage) {
        return await this.dbStorage.createUser(user);
      }
    } catch (err) {
      console.error("Database error in createUser, falling back to memory storage:", err);
    }
    return this.memStorage.createUser(user);
  }
  
  async createFeedback(feedbackData: InsertFeedback): Promise<Feedback> {
    try {
      if (this.dbStorage) {
        return await this.dbStorage.createFeedback(feedbackData);
      }
    } catch (err) {
      console.error("Database error in createFeedback, falling back to memory storage:", err);
    }
    return this.memStorage.createFeedback(feedbackData);
  }
  
  async getAllFeedback(): Promise<Feedback[]> {
    try {
      if (this.dbStorage) {
        return await this.dbStorage.getAllFeedback();
      }
    } catch (err) {
      console.error("Database error in getAllFeedback, falling back to memory storage:", err);
    }
    return this.memStorage.getAllFeedback();
  }
  
  async getFeedbackStats(): Promise<{
    totalResponses: number;
    veryDisappointed: number;
    somewhatDisappointed: number;
    notDisappointed: number;
    pmfScore: number;
  }> {
    try {
      if (this.dbStorage) {
        return await this.dbStorage.getFeedbackStats();
      }
    } catch (err) {
      console.error("Database error in getFeedbackStats, falling back to memory storage:", err);
    }
    return this.memStorage.getFeedbackStats();
  }

  // Watchlist methods --------------------------------------------------------
  async addWatchlistEntry(sessionId: string, symbol: string, marginOfSafety: number): Promise<WatchlistEntry> {
    try {
      if (this.dbStorage) {
        return await this.dbStorage.addWatchlistEntry(sessionId, symbol, marginOfSafety);
      }
    } catch (err) {
      console.error("Database error in addWatchlistEntry, falling back to memory storage:", err);
    }
    return this.memStorage.addWatchlistEntry(sessionId, symbol, marginOfSafety);
  }

  async listWatchlistEntries(sessionId: string): Promise<WatchlistEntry[]> {
    try {
      if (this.dbStorage) {
        return await this.dbStorage.listWatchlistEntries(sessionId);
      }
    } catch (err) {
      console.error("Database error in listWatchlistEntries, falling back to memory storage:", err);
    }
    return this.memStorage.listWatchlistEntries(sessionId);
  }

  async removeWatchlistEntry(id: number, sessionId: string): Promise<boolean> {
    try {
      if (this.dbStorage) {
        return await this.dbStorage.removeWatchlistEntry(id, sessionId);
      }
    } catch (err) {
      console.error("Database error in removeWatchlistEntry, falling back to memory storage:", err);
    }
    return this.memStorage.removeWatchlistEntry(id, sessionId);
  }

  // Fundamentals cache methods --------------------------------------------
  async getFundamentalsCache(symbol: string): Promise<FundamentalsCacheRow | undefined> {
    try {
      if (this.dbStorage) {
        return await this.dbStorage.getFundamentalsCache(symbol);
      }
    } catch (err) {
      console.error("Database error in getFundamentalsCache, falling back to memory storage:", err);
    }
    return this.memStorage.getFundamentalsCache(symbol);
  }

  async upsertFundamentalsCache(
    symbol: string,
    payload: StockResponse,
    dataSource: string,
    fetchedAt: Date,
  ): Promise<FundamentalsCacheRow> {
    try {
      if (this.dbStorage) {
        return await this.dbStorage.upsertFundamentalsCache(symbol, payload, dataSource, fetchedAt);
      }
    } catch (err) {
      console.error("Database error in upsertFundamentalsCache, falling back to memory storage:", err);
    }
    return this.memStorage.upsertFundamentalsCache(symbol, payload, dataSource, fetchedAt);
  }

  // Report job methods (Task #57) -------------------------------------------
  // NOTE: unlike most methods, report-job persistence is the whole point of
  // the feature (resumability across restarts), so a memory fallback would be
  // silently lossy. We still fall back — a degraded in-memory job beats a
  // hard failure — but the engine logs loudly when the DB is unavailable.
  async createReportJob(email: string, totalTickers: number, listAsOf: string): Promise<ReportJob> {
    try {
      if (this.dbStorage) {
        return await this.dbStorage.createReportJob(email, totalTickers, listAsOf);
      }
    } catch (err) {
      console.error("Database error in createReportJob, falling back to memory storage:", err);
    }
    return this.memStorage.createReportJob(email, totalTickers, listAsOf);
  }

  async getReportJob(id: number): Promise<ReportJob | undefined> {
    try {
      if (this.dbStorage) {
        return await this.dbStorage.getReportJob(id);
      }
    } catch (err) {
      console.error("Database error in getReportJob, falling back to memory storage:", err);
    }
    return this.memStorage.getReportJob(id);
  }

  async getActiveReportJob(): Promise<ReportJob | undefined> {
    try {
      if (this.dbStorage) {
        return await this.dbStorage.getActiveReportJob();
      }
    } catch (err) {
      console.error("Database error in getActiveReportJob, falling back to memory storage:", err);
    }
    return this.memStorage.getActiveReportJob();
  }

  async getLatestReportJob(): Promise<ReportJob | undefined> {
    try {
      if (this.dbStorage) {
        return await this.dbStorage.getLatestReportJob();
      }
    } catch (err) {
      console.error("Database error in getLatestReportJob, falling back to memory storage:", err);
    }
    return this.memStorage.getLatestReportJob();
  }

  async updateReportJob(
    id: number,
    fields: Partial<Pick<ReportJob, "status" | "error" | "completedAt" | "emailedAt">>,
  ): Promise<ReportJob | undefined> {
    try {
      if (this.dbStorage) {
        return await this.dbStorage.updateReportJob(id, fields);
      }
    } catch (err) {
      console.error("Database error in updateReportJob, falling back to memory storage:", err);
    }
    return this.memStorage.updateReportJob(id, fields);
  }

  async addReportJobResult(result: InsertReportJobResult): Promise<void> {
    try {
      if (this.dbStorage) {
        return await this.dbStorage.addReportJobResult(result);
      }
    } catch (err) {
      console.error("Database error in addReportJobResult, falling back to memory storage:", err);
    }
    return this.memStorage.addReportJobResult(result);
  }

  async countReportJobResults(jobId: number): Promise<number> {
    try {
      if (this.dbStorage) {
        return await this.dbStorage.countReportJobResults(jobId);
      }
    } catch (err) {
      console.error("Database error in countReportJobResults, falling back to memory storage:", err);
    }
    return this.memStorage.countReportJobResults(jobId);
  }

  async listReportJobResults(jobId: number): Promise<ReportJobResult[]> {
    try {
      if (this.dbStorage) {
        return await this.dbStorage.listReportJobResults(jobId);
      }
    } catch (err) {
      console.error("Database error in listReportJobResults, falling back to memory storage:", err);
    }
    return this.memStorage.listReportJobResults(jobId);
  }
}

// Export a storage instance that gracefully falls back to memory storage when needed
export const storage = new SafeStorageWrapper();
