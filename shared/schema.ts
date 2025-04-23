import { pgTable, text, serial, integer, boolean, decimal, varchar, timestamp, jsonb } from "drizzle-orm/pg-core";
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
  error: z.boolean().optional(),
  errorMessage: z.string().optional(),
});

export type StockResponse = z.infer<typeof stockResponseSchema>;

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

// Undervalued stocks report schema
export const undervaluedStock = pgTable("undervalued_stock", {
  id: serial("id").primaryKey(),
  symbol: varchar("symbol", { length: 10 }).notNull(),
  name: text("name").notNull(),
  price: decimal("price", { precision: 10, scale: 2 }).notNull(),
  eps: decimal("eps", { precision: 10, scale: 2 }).notNull(),
  fcfPerShare: decimal("fcf_per_share", { precision: 10, scale: 2 }).notNull(),
  growthRate: decimal("growth_rate", { precision: 6, scale: 2 }).notNull(),
  intrinsicValue: decimal("intrinsic_value", { precision: 10, scale: 2 }).notNull(),
  buyBelowPrice: decimal("buy_below_price", { precision: 10, scale: 2 }).notNull(),
  discountPremium: decimal("discount_premium", { precision: 6, scale: 2 }).notNull(),
  quality: text("quality").notNull(), // "Exceptional", "Good", "Average", "Speculative"
  qualityScore: integer("quality_score").notNull(),
  dateEvaluated: timestamp("date_evaluated").defaultNow().notNull(),
  reportId: integer("report_id").notNull(),
});

// Report that contains multiple undervalued stocks
export const undervaluedReport = pgTable("undervalued_report", {
  id: serial("id").primaryKey(),
  reportDate: timestamp("report_date").defaultNow().notNull(),
  stocksCount: integer("stocks_count").notNull(),
  indexes: text("indexes").notNull(), // e.g., "S&P 500, Russell 2000"
  isPending: boolean("is_pending").default(false).notNull(),
  notes: text("notes"),
});

export const insertUndervaluedStockSchema = createInsertSchema(undervaluedStock).omit({
  id: true,
});

export const insertUndervaluedReportSchema = createInsertSchema(undervaluedReport).omit({
  id: true,
});

export type InsertUndervaluedStock = z.infer<typeof insertUndervaluedStockSchema>;
export type UndervaluedStock = typeof undervaluedStock.$inferSelect;

export type InsertUndervaluedReport = z.infer<typeof insertUndervaluedReportSchema>;
export type UndervaluedReport = typeof undervaluedReport.$inferSelect;

// Schema for individual undervalued stock response
export const undervaluedStockSchema = z.object({
  symbol: z.string(),
  name: z.string(),
  price: z.number(),
  eps: z.number(),
  fcf_per_share: z.number(),
  growth_rate: z.number(),
  intrinsic_value: z.number(),
  buy_below_price: z.number(),
  discount_premium: z.number(),
  quality: z.string(),
  quality_score: z.number(),
  date_evaluated: z.string()
});

// Schema for undervalued stocks report response
export const undervaluedStocksReportSchema = z.object({
  id: z.number(),
  reportDate: z.string(), 
  stocksCount: z.number(),
  indexes: z.string(),
  stocks: z.array(undervaluedStockSchema),
});

export type UndervaluedStockResponse = z.infer<typeof undervaluedStockSchema>;
export type UndervaluedStocksReportResponse = z.infer<typeof undervaluedStocksReportSchema>;
