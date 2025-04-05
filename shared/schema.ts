import { pgTable, text, serial, integer, boolean, decimal, varchar } from "drizzle-orm/pg-core";
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
});

export type StockResponse = z.infer<typeof stockResponseSchema>;
