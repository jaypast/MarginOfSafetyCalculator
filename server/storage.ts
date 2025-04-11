import { users, type User, type InsertUser, feedbacks, type Feedback, type InsertFeedback } from "@shared/schema";
import { db } from "./db";
import { eq } from "drizzle-orm";

// Interface with CRUD methods
export interface IStorage {
  // User methods
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  
  // Feedback methods
  createFeedback(feedback: InsertFeedback): Promise<Feedback>;
  getAllFeedback(): Promise<Feedback[]>;
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
  async createFeedback(feedback: InsertFeedback): Promise<Feedback> {
    const [result] = await db
      .insert(feedbacks)
      .values(feedback)
      .returning();
    return result;
  }
  
  async getAllFeedback(): Promise<Feedback[]> {
    return await db
      .select()
      .from(feedbacks)
      .orderBy(feedbacks.submittedAt);
  }
}

// For backward compatibility, we'll still provide a MemStorage implementation
export class MemStorage implements IStorage {
  private users: Map<number, User>;
  private feedbackItems: Map<number, Feedback>;
  userCurrentId: number;
  feedbackCurrentId: number;

  constructor() {
    this.users = new Map();
    this.feedbackItems = new Map();
    this.userCurrentId = 1;
    this.feedbackCurrentId = 1;
  }

  async getUser(id: number): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username === username,
    );
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = this.userCurrentId++;
    const user: User = { ...insertUser, id };
    this.users.set(id, user);
    return user;
  }
  
  async createFeedback(insertFeedback: InsertFeedback): Promise<Feedback> {
    const id = this.feedbackCurrentId++;
    const now = new Date();
    
    // Create feedback with required fields
    const feedback: Feedback = { 
      id,
      name: insertFeedback.name ?? '',
      email: insertFeedback.email ?? '',
      pmfScore: insertFeedback.pmfScore ?? '',
      improvement: insertFeedback.improvement ?? '',
      feedback: insertFeedback.feedback ?? '',
      submittedAt: now 
    };
    
    this.feedbackItems.set(id, feedback);
    return feedback;
  }
  
  async getAllFeedback(): Promise<Feedback[]> {
    return Array.from(this.feedbackItems.values()).sort((a, b) => {
      const dateA = new Date(a.submittedAt).getTime();
      const dateB = new Date(b.submittedAt).getTime();
      return dateB - dateA; // Most recent first
    });
  }
}

// Use the DatabaseStorage implementation
export const storage = new DatabaseStorage();
