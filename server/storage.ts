import { 
  users, type User, type InsertUser, 
  feedback, type Feedback, type InsertFeedback,
  undervaluedReport, type UndervaluedReport, type InsertUndervaluedReport,
  undervaluedStock, type UndervaluedStock, type InsertUndervaluedStock,
  type UndervaluedStocksReportResponse
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, and } from "drizzle-orm";

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
  
  // Undervalued stocks report methods
  createUndervaluedReport(reportData: InsertUndervaluedReport): Promise<UndervaluedReport>;
  createUndervaluedStock(stockData: InsertUndervaluedStock): Promise<UndervaluedStock>;
  getLatestUndervaluedReport(): Promise<UndervaluedStocksReportResponse | null>;
  getUndervaluedReportById(id: number): Promise<UndervaluedStocksReportResponse | null>;
  getAllUndervaluedReports(): Promise<UndervaluedReport[]>;
}

// Memory storage for fallback when database is not available
class MemStorage implements IStorage {
  private users: User[] = [];
  private feedbackEntries: Feedback[] = [];
  private undervaluedReports: UndervaluedReport[] = [];
  private undervaluedStocks: UndervaluedStock[] = [];
  private nextUserId = 1;
  private nextFeedbackId = 1;
  private nextReportId = 1;
  private nextStockId = 1;
  
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
  
  // Undervalued stocks report methods
  async createUndervaluedReport(reportData: InsertUndervaluedReport): Promise<UndervaluedReport> {
    const now = new Date();
    const newReport = {
      ...reportData,
      id: this.nextReportId++,
      reportDate: reportData.reportDate || now
    } as UndervaluedReport;
    this.undervaluedReports.push(newReport);
    console.log("Created undervalued stocks report:", newReport);
    return newReport;
  }

  async createUndervaluedStock(stockData: InsertUndervaluedStock): Promise<UndervaluedStock> {
    const now = new Date();
    const newStock = {
      ...stockData,
      id: this.nextStockId++,
      dateEvaluated: stockData.dateEvaluated || now
    } as UndervaluedStock;
    this.undervaluedStocks.push(newStock);
    return newStock;
  }

  async getLatestUndervaluedReport(): Promise<UndervaluedStocksReportResponse | null> {
    if (this.undervaluedReports.length === 0) {
      return null;
    }

    // Sort reports by date in descending order
    const sortedReports = [...this.undervaluedReports].sort((a, b) => {
      const dateA = a.reportDate instanceof Date ? a.reportDate : new Date(a.reportDate || 0);
      const dateB = b.reportDate instanceof Date ? b.reportDate : new Date(b.reportDate || 0);
      return dateB.getTime() - dateA.getTime(); // Descending order
    });

    const latestReport = sortedReports[0];
    
    // Get all stocks for this report
    const stocks = this.undervaluedStocks.filter(stock => stock.reportId === latestReport.id);
    
    return {
      id: latestReport.id,
      reportDate: latestReport.reportDate instanceof Date 
        ? latestReport.reportDate.toISOString() 
        : String(latestReport.reportDate),
      stocksCount: stocks.length,
      indexes: latestReport.indexes,
      stocks: stocks.map(stock => ({
        symbol: stock.symbol,
        name: stock.name,
        price: Number(stock.price),
        eps: Number(stock.eps),
        fcf_per_share: Number(stock.fcfPerShare),
        growth_rate: Number(stock.growthRate),
        intrinsic_value: Number(stock.intrinsicValue),
        buy_below_price: Number(stock.buyBelowPrice),
        discount_premium: Number(stock.discountPremium),
        quality: stock.quality,
        quality_score: stock.qualityScore,
        date_evaluated: stock.dateEvaluated instanceof Date 
          ? stock.dateEvaluated.toISOString() 
          : String(stock.dateEvaluated)
      }))
    };
  }

  async getUndervaluedReportById(id: number): Promise<UndervaluedStocksReportResponse | null> {
    const report = this.undervaluedReports.find(r => r.id === id);
    if (!report) {
      return null;
    }
    
    // Get all stocks for this report
    const stocks = this.undervaluedStocks.filter(stock => stock.reportId === report.id);
    
    return {
      id: report.id,
      reportDate: report.reportDate instanceof Date 
        ? report.reportDate.toISOString() 
        : String(report.reportDate),
      stocksCount: stocks.length,
      indexes: report.indexes,
      stocks: stocks.map(stock => ({
        symbol: stock.symbol,
        name: stock.name,
        price: Number(stock.price),
        eps: Number(stock.eps),
        fcf_per_share: Number(stock.fcfPerShare),
        growth_rate: Number(stock.growthRate),
        intrinsic_value: Number(stock.intrinsicValue),
        buy_below_price: Number(stock.buyBelowPrice),
        discount_premium: Number(stock.discountPremium),
        quality: stock.quality,
        quality_score: stock.qualityScore,
        date_evaluated: stock.dateEvaluated instanceof Date 
          ? stock.dateEvaluated.toISOString() 
          : String(stock.dateEvaluated)
      }))
    };
  }

  async getAllUndervaluedReports(): Promise<UndervaluedReport[]> {
    return [...this.undervaluedReports].sort((a, b) => {
      const dateA = a.reportDate instanceof Date ? a.reportDate : new Date(a.reportDate || 0);
      const dateB = b.reportDate instanceof Date ? b.reportDate : new Date(b.reportDate || 0);
      return dateB.getTime() - dateA.getTime(); // Descending order (newest first)
    });
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
  
  // Undervalued stocks report methods
  async createUndervaluedReport(reportData: InsertUndervaluedReport): Promise<UndervaluedReport> {
    if (!db) {
      console.log("Database not available - using memory storage fallback");
      throw new Error("Database connection not available");
    }
    
    const [newReport] = await db
      .insert(undervaluedReport)
      .values(reportData)
      .returning();
    return newReport;
  }

  async createUndervaluedStock(stockData: InsertUndervaluedStock): Promise<UndervaluedStock> {
    if (!db) {
      console.log("Database not available - using memory storage fallback");
      throw new Error("Database connection not available");
    }
    
    const [newStock] = await db
      .insert(undervaluedStock)
      .values(stockData)
      .returning();
    return newStock;
  }

  async getLatestUndervaluedReport(): Promise<UndervaluedStocksReportResponse | null> {
    if (!db) {
      console.log("Database not available - using memory storage fallback");
      return null;
    }
    
    // Get the latest report
    const [latestReport] = await db
      .select()
      .from(undervaluedReport)
      .orderBy(desc(undervaluedReport.reportDate))
      .limit(1);
    
    if (!latestReport) {
      return null;
    }
    
    // Get all stocks for this report
    const stocks = await db
      .select()
      .from(undervaluedStock)
      .where(eq(undervaluedStock.reportId, latestReport.id));
    
    return {
      id: latestReport.id,
      reportDate: latestReport.reportDate instanceof Date 
        ? latestReport.reportDate.toISOString() 
        : String(latestReport.reportDate),
      stocksCount: stocks.length,
      indexes: latestReport.indexes,
      stocks: stocks.map(stock => ({
        symbol: stock.symbol,
        name: stock.name,
        price: Number(stock.price),
        eps: Number(stock.eps),
        fcf_per_share: Number(stock.fcfPerShare),
        growth_rate: Number(stock.growthRate),
        intrinsic_value: Number(stock.intrinsicValue),
        buy_below_price: Number(stock.buyBelowPrice),
        discount_premium: Number(stock.discountPremium),
        quality: stock.quality,
        quality_score: stock.qualityScore,
        date_evaluated: stock.dateEvaluated instanceof Date 
          ? stock.dateEvaluated.toISOString() 
          : String(stock.dateEvaluated)
      }))
    };
  }

  async getUndervaluedReportById(id: number): Promise<UndervaluedStocksReportResponse | null> {
    if (!db) {
      console.log("Database not available - using memory storage fallback");
      return null;
    }
    
    // Get the report by ID
    const [report] = await db
      .select()
      .from(undervaluedReport)
      .where(eq(undervaluedReport.id, id));
    
    if (!report) {
      return null;
    }
    
    // Get all stocks for this report
    const stocks = await db
      .select()
      .from(undervaluedStock)
      .where(eq(undervaluedStock.reportId, report.id));
    
    return {
      id: report.id,
      reportDate: report.reportDate instanceof Date 
        ? report.reportDate.toISOString() 
        : String(report.reportDate),
      stocksCount: stocks.length,
      indexes: report.indexes,
      stocks: stocks.map(stock => ({
        symbol: stock.symbol,
        name: stock.name,
        price: Number(stock.price),
        eps: Number(stock.eps),
        fcf_per_share: Number(stock.fcfPerShare),
        growth_rate: Number(stock.growthRate),
        intrinsic_value: Number(stock.intrinsicValue),
        buy_below_price: Number(stock.buyBelowPrice),
        discount_premium: Number(stock.discountPremium),
        quality: stock.quality,
        quality_score: stock.qualityScore,
        date_evaluated: stock.dateEvaluated instanceof Date 
          ? stock.dateEvaluated.toISOString() 
          : String(stock.dateEvaluated)
      }))
    };
  }

  async getAllUndervaluedReports(): Promise<UndervaluedReport[]> {
    if (!db) {
      console.log("Database not available - using memory storage fallback");
      return [];
    }
    
    const reports = await db
      .select()
      .from(undervaluedReport)
      .orderBy(desc(undervaluedReport.reportDate));
    
    return reports;
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
  
  // Undervalued stocks report methods
  async createUndervaluedReport(reportData: InsertUndervaluedReport): Promise<UndervaluedReport> {
    try {
      if (this.dbStorage) {
        return await this.dbStorage.createUndervaluedReport(reportData);
      }
    } catch (err) {
      console.error("Database error in createUndervaluedReport, falling back to memory storage:", err);
    }
    return this.memStorage.createUndervaluedReport(reportData);
  }

  async createUndervaluedStock(stockData: InsertUndervaluedStock): Promise<UndervaluedStock> {
    try {
      if (this.dbStorage) {
        return await this.dbStorage.createUndervaluedStock(stockData);
      }
    } catch (err) {
      console.error("Database error in createUndervaluedStock, falling back to memory storage:", err);
    }
    return this.memStorage.createUndervaluedStock(stockData);
  }

  async getLatestUndervaluedReport(): Promise<UndervaluedStocksReportResponse | null> {
    try {
      if (this.dbStorage) {
        return await this.dbStorage.getLatestUndervaluedReport();
      }
    } catch (err) {
      console.error("Database error in getLatestUndervaluedReport, falling back to memory storage:", err);
    }
    return this.memStorage.getLatestUndervaluedReport();
  }

  async getUndervaluedReportById(id: number): Promise<UndervaluedStocksReportResponse | null> {
    try {
      if (this.dbStorage) {
        return await this.dbStorage.getUndervaluedReportById(id);
      }
    } catch (err) {
      console.error("Database error in getUndervaluedReportById, falling back to memory storage:", err);
    }
    return this.memStorage.getUndervaluedReportById(id);
  }

  async getAllUndervaluedReports(): Promise<UndervaluedReport[]> {
    try {
      if (this.dbStorage) {
        return await this.dbStorage.getAllUndervaluedReports();
      }
    } catch (err) {
      console.error("Database error in getAllUndervaluedReports, falling back to memory storage:", err);
    }
    return this.memStorage.getAllUndervaluedReports();
  }
}

// Export a storage instance that gracefully falls back to memory storage when needed
export const storage = new SafeStorageWrapper();
