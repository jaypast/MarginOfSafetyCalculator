import { users, type User, type InsertUser, feedback, type Feedback, type InsertFeedback } from "@shared/schema";
import { db } from "./db";
import { eq } from "drizzle-orm";

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
}

export class DatabaseStorage implements IStorage {
  // User methods
  async getUser(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user || undefined;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(insertUser)
      .returning();
    return user;
  }
  
  // Feedback methods
  async createFeedback(feedbackData: InsertFeedback): Promise<Feedback> {
    const [newFeedback] = await db
      .insert(feedback)
      .values(feedbackData)
      .returning();
    return newFeedback;
  }
  
  async getAllFeedback(): Promise<Feedback[]> {
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
}

// Use the database storage implementation
export const storage = new DatabaseStorage();
