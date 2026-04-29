import {
  users, type User, type InsertUser,
  feedback, type Feedback, type InsertFeedback,
  watchlist, type WatchlistEntry,
} from "@shared/schema";
import { db } from "./db";
import { and, eq } from "drizzle-orm";

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
}

// Memory storage for fallback when database is not available.
// Exported so tests can exercise the same PMF math the runtime uses.
export class MemStorage implements IStorage {
  private users: User[] = [];
  private feedbackEntries: Feedback[] = [];
  private watchlistEntries: WatchlistEntry[] = [];
  private nextUserId = 1;
  private nextFeedbackId = 1;
  private nextWatchlistId = 1;
  
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
}

// Export a storage instance that gracefully falls back to memory storage when needed
export const storage = new SafeStorageWrapper();
