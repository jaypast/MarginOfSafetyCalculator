import type { Express, Request, Response } from "express";
import { clerkClient, getAuth } from "@clerk/express";
import { and, count, desc, eq, gte, ilike, lt, or, sql } from "drizzle-orm";
import { z } from "zod";
import {
  accounts, accountEvents, adminAuditLog, feedback, watchlist,
} from "@shared/schema";
import { db, pool } from "./db";
import { AccountRequest, getApplicationAccount, requireAccount, requireOwner, requireSameOrigin } from "./auth";
import { normalizeAccountEvent, quoteCsvCell } from "./accountSecurity";
const eventRate = new Map<string, { count: number; resetAt: number }>();
let lastEventRateCleanup = 0;

function errorResponse(res: Response, error: unknown, action: string) {
  console.error(`${action}:`, error instanceof Error ? error.message : "unknown error");
  return res.status(503).json({ message: "This request could not be completed. Please try again." });
}

function getDateRange(req: Request): { from: Date; to: Date } | null {
  const fromRaw = typeof req.query.from === "string" ? req.query.from : undefined;
  const toRaw = typeof req.query.to === "string" ? req.query.to : undefined;
  const now = new Date();
  const endDate = toRaw ? new Date(`${toRaw}T00:00:00.000Z`) : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const to = new Date(endDate.getTime() + 86400000);
  const from = fromRaw ? new Date(`${fromRaw}T00:00:00.000Z`) : new Date(to.getTime() - 30 * 86400000);
  if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime()) || from >= to || to.getTime() - from.getTime() > 367 * 86400000) return null;
  return { from, to };
}

export function registerAccountRoutes(app: Express) {
  app.get("/api/account", requireAccount, (req, res) => {
    const account = (req as AccountRequest).appAccount!;
    return res.json({
      id: account.id,
      email: account.email,
      role: account.role,
      status: account.status,
      createdAt: account.createdAt.toISOString(),
    });
  });

  app.post("/api/account-events", requireSameOrigin, async (req, res) => {
    if (!db) return res.status(503).json({ message: "Usage reporting is temporarily unavailable." });
    const ipKey = getAuth(req).userId || req.ip || "unknown";
    const now = Date.now();
    if (now - lastEventRateCleanup > 60_000) {
      eventRate.forEach((entry, key) => { if (entry.resetAt <= now) eventRate.delete(key); });
      lastEventRateCleanup = now;
    }
    const current = eventRate.get(ipKey);
    if (current && current.resetAt > now && current.count >= 90) {
      return res.status(429).json({ message: "Too many activity events. Try again shortly." });
    }
    if (!current || current.resetAt <= now) eventRate.set(ipKey, { count: 1, resetAt: now + 60_000 });
    else current.count += 1;

    const parsed = normalizeAccountEvent(req.body);
    if (!parsed) {
      return res.status(400).json({ message: "Unsupported activity event." });
    }

    try {
      let accountId: number | null = null;
      const clerkUserId = getAuth(req).userId;
      if (clerkUserId) {
        const account = await getApplicationAccount(clerkUserId);
        if (account.status === "suspended") return res.status(403).json({ message: "This account is suspended." });
        accountId = account.id;
      }
      await db.insert(accountEvents).values({
        accountId,
        audience: accountId === null ? "anonymous" : "registered",
        eventName: parsed.eventName,
        properties: parsed.properties,
      });
      return res.status(202).json({ accepted: true });
    } catch (error) {
      return errorResponse(res, error, "Could not record account event");
    }
  });

  app.get("/api/admin/accounts", requireAccount, requireOwner, async (req, res) => {
    if (!db) return res.status(503).json({ message: "Account management is temporarily unavailable." });
    const parsed = z.object({ search: z.string().max(100).optional(), offset: z.coerce.number().int().min(0).max(100000).default(0) }).safeParse(req.query);
    if (!parsed.success) return res.status(400).json({ message: "Invalid account search." });
    try {
      const search = parsed.data.search?.trim();
      const matches = search ? or(ilike(accounts.email, `%${search}%`), ilike(accounts.clerkUserId, `%${search}%`)) : undefined;
      const rows = await db.select({
        id: accounts.id, email: accounts.email, role: accounts.role, status: accounts.status,
        createdAt: accounts.createdAt, suspendedAt: accounts.suspendedAt,
        watchlistCount: count(watchlist.id).mapWith(Number),
      }).from(accounts)
        .leftJoin(watchlist, eq(watchlist.userId, accounts.id))
        .where(matches)
        .groupBy(accounts.id)
        .orderBy(desc(accounts.createdAt))
        .limit(50).offset(parsed.data.offset);
      const [total] = await db.select({ value: count() }).from(accounts).where(matches);
      return res.json({ accounts: rows, total: Number(total.value), offset: parsed.data.offset, limit: 50 });
    } catch (error) {
      return errorResponse(res, error, "Could not list accounts");
    }
  });

  app.patch("/api/admin/accounts/:id/status", requireSameOrigin, requireAccount, requireOwner, async (req, res) => {
    if (!db) return res.status(503).json({ message: "Account management is temporarily unavailable." });
    const id = Number(req.params.id);
    const parsed = z.object({ status: z.enum(["active", "suspended"]) }).safeParse(req.body);
    if (!Number.isSafeInteger(id) || id <= 0 || !parsed.success) return res.status(400).json({ message: "Invalid account update." });
    const actor = (req as AccountRequest).appAccount!;
    try {
      const [target] = await db.select().from(accounts).where(eq(accounts.id, id)).limit(1);
      if (!target) return res.status(404).json({ message: "Account not found." });
      if (target.role === "owner" || target.id === actor.id) return res.status(409).json({ message: "Owner accounts cannot be suspended or changed here." });
      const suspendedAt = parsed.data.status === "suspended" ? new Date() : null;
      await db.transaction(async (tx) => {
        await tx.update(accounts).set({ status: parsed.data.status, suspendedAt, updatedAt: new Date() }).where(eq(accounts.id, id));
        await tx.insert(adminAuditLog).values({
          actorAccountId: actor.id,
          action: parsed.data.status === "suspended" ? "account_suspended" : "account_reactivated",
          targetAccountId: id,
          details: {},
        });
      });
      return res.json({ id, status: parsed.data.status, suspendedAt: suspendedAt?.toISOString() ?? null });
    } catch (error) {
      return errorResponse(res, error, "Could not update account");
    }
  });

  app.delete("/api/admin/accounts/:id", requireSameOrigin, requireAccount, requireOwner, async (req, res) => {
    if (!db) return res.status(503).json({ message: "Account management is temporarily unavailable." });
    const id = Number(req.params.id);
    const parsed = z.object({ confirmation: z.literal("DELETE") }).safeParse(req.body);
    if (!Number.isSafeInteger(id) || id <= 0 || !parsed.success) return res.status(400).json({ message: "Type DELETE to confirm account removal." });
    const actor = (req as AccountRequest).appAccount!;
    if (actor.id === id) return res.status(409).json({ message: "You cannot delete your own owner account." });
    try {
      const [target] = await db.select().from(accounts).where(eq(accounts.id, id)).limit(1);
      if (!target) return res.status(404).json({ message: "Account not found." });
      if (target.role === "owner") return res.status(409).json({ message: "Owner accounts are protected from deletion here." });
      try {
        await clerkClient.users.deleteUser(target.clerkUserId);
      } catch (error) {
        const details = error as { status?: number; statusCode?: number; errors?: Array<{ code?: string }> };
        const notFound = details.status === 404
          || details.statusCode === 404
          || details.errors?.some((item) => item.code === "resource_not_found");
        if (!notFound) throw error;
      }
      await db.transaction(async (tx) => {
        await tx.insert(adminAuditLog).values({
          actorAccountId: actor.id, action: "account_deleted", targetAccountId: id,
          details: {},
        });
        await tx.delete(accounts).where(eq(accounts.id, id));
      });
      return res.status(204).end();
    } catch (error) {
      return errorResponse(res, error, "Could not delete account");
    }
  });

  app.get("/api/admin/reports", requireAccount, requireOwner, async (req, res) => {
    if (!db) return res.status(503).json({ message: "Reporting is temporarily unavailable." });
    const range = getDateRange(req);
    if (!range) return res.status(400).json({ message: "Choose a valid date range of 366 days or less." });
    try {
      const interval = and(gte(accountEvents.createdAt, range.from), lt(accountEvents.createdAt, range.to));
      const [registrations, activeUsers, allAccounts, eventRows, stockRows] = await Promise.all([
        db.select({ value: count() }).from(accounts).where(and(gte(accounts.createdAt, range.from), lt(accounts.createdAt, range.to))),
        db.select({ value: sql<number>`count(distinct ${accountEvents.accountId})`.mapWith(Number) }).from(accountEvents)
          .where(and(interval, sql`${accountEvents.accountId} is not null`)),
        db.select({ value: count() }).from(accounts),
        db.select({
          eventName: accountEvents.eventName,
          audience: accountEvents.audience,
          total: count().mapWith(Number),
        }).from(accountEvents).where(interval)
          .groupBy(accountEvents.eventName, accountEvents.audience)
          .orderBy(accountEvents.eventName),
        db.select({ symbol: watchlist.symbol, total: count().mapWith(Number) }).from(watchlist)
          .groupBy(watchlist.symbol).orderBy(desc(count())).limit(10),
      ]);
      let databaseStatus: "healthy" | "unavailable" = "healthy";
      try {
        if (!pool) throw new Error("database pool missing");
        let timeout: ReturnType<typeof setTimeout> | undefined;
        try {
          await Promise.race([
            pool.query("select 1"),
            new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error("healthcheck timeout")), 2500); }),
          ]);
        } finally {
          if (timeout) clearTimeout(timeout);
        }
      } catch {
        databaseStatus = "unavailable";
      }
      const auditCount = await db.select({ value: count() }).from(adminAuditLog)
        .where(and(gte(adminAuditLog.createdAt, range.from), lt(adminAuditLog.createdAt, range.to)));
      return res.json({
        range: { from: range.from.toISOString(), to: range.to.toISOString() },
        registrations: Number(registrations[0].value),
        activeRegisteredUsers: activeUsers[0].value,
        currentRegisteredUsers: Number(allAccounts[0].value),
        activity: eventRows,
        popularStocks: stockRows,
        auditActions: Number(auditCount[0].value),
        system: { database: databaseStatus, marketDataHealth: "Based on reported search outcomes; external provider status is not probed directly." },
        definitions: {
          activeRegisteredUsers: "Distinct signed-in accounts that generated at least one recorded activity event in the selected date range.",
          popularStocks: "Current account watchlist entries by symbol; not historical searches.",
          history: "Reporting starts when account event collection is enabled; older activity is not reconstructed.",
        },
      });
    } catch (error) {
      return errorResponse(res, error, "Could not generate admin report");
    }
  });

  app.get("/api/admin/export", requireAccount, requireOwner, async (req, res) => {
    if (!db) return res.status(503).send("Reporting is temporarily unavailable.");
    const range = getDateRange(req);
    if (!range) return res.status(400).send("Invalid date range.");
    try {
      const interval = and(gte(accountEvents.createdAt, range.from), lt(accountEvents.createdAt, range.to));
      const [rows, registrations, activeUsers, allAccounts, stocks] = await Promise.all([
        db.select({
        eventName: accountEvents.eventName,
        audience: accountEvents.audience,
        total: count().mapWith(Number),
        }).from(accountEvents).where(interval).groupBy(accountEvents.eventName, accountEvents.audience),
        db.select({ total: count().mapWith(Number) }).from(accounts)
          .where(and(gte(accounts.createdAt, range.from), lt(accounts.createdAt, range.to))),
        db.select({ total: sql<number>`count(distinct ${accountEvents.accountId})`.mapWith(Number) }).from(accountEvents)
          .where(and(interval, sql`${accountEvents.accountId} is not null`)),
        db.select({ total: count().mapWith(Number) }).from(accounts),
        db.select({ symbol: watchlist.symbol, total: count().mapWith(Number) }).from(watchlist)
          .groupBy(watchlist.symbol).orderBy(desc(count())).limit(10),
      ]);
      const csv = [
        ["Section", "Name", "Count", "Audience"].map(quoteCsvCell).join(","),
        ["Range", "From (UTC)", range.from.toISOString(), ""].map(quoteCsvCell).join(","),
        ["Range", "Through (UTC, exclusive)", range.to.toISOString(), ""].map(quoteCsvCell).join(","),
        ["Summary", "New registrations", registrations[0].total, ""].map(quoteCsvCell).join(","),
        ["Summary", "Active registered users", activeUsers[0].total, ""].map(quoteCsvCell).join(","),
        ["Summary", "Current registered users", allAccounts[0].total, ""].map(quoteCsvCell).join(","),
        ...rows.map((row) => ["Activity", row.eventName, row.total, row.audience].map(quoteCsvCell).join(",")),
        ...stocks.map((row) => ["Current saved stocks", row.symbol, row.total, "registered accounts"].map(quoteCsvCell).join(",")),
      ].join("\r\n");
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", 'attachment; filename="account-activity-report.csv"');
      res.setHeader("Cache-Control", "no-store");
      return res.send(`\uFEFF${csv}`);
    } catch (error) {
      return errorResponse(res, error, "Could not export report");
    }
  });

  app.get("/api/admin/audit", requireAccount, requireOwner, async (_req, res) => {
    if (!db) return res.status(503).json({ message: "Audit history is temporarily unavailable." });
    try {
      const rows = await db.select({
        id: adminAuditLog.id, action: adminAuditLog.action,
        targetAccountId: adminAuditLog.targetAccountId, details: adminAuditLog.details,
        createdAt: adminAuditLog.createdAt, actorEmail: accounts.email,
      }).from(adminAuditLog).leftJoin(accounts, eq(adminAuditLog.actorAccountId, accounts.id))
        .orderBy(desc(adminAuditLog.createdAt)).limit(100);
      return res.json(rows);
    } catch (error) {
      return errorResponse(res, error, "Could not read audit history");
    }
  });

  app.delete("/api/admin/feedback/:id", requireSameOrigin, requireAccount, requireOwner, async (req, res) => {
    if (!db) return res.status(503).json({ message: "Feedback management is temporarily unavailable." });
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id <= 0) return res.status(400).json({ message: "Invalid feedback entry." });
    const actor = (req as AccountRequest).appAccount!;
    try {
      const [existing] = await db.select({ id: feedback.id }).from(feedback).where(eq(feedback.id, id)).limit(1);
      if (!existing) return res.status(404).json({ message: "Feedback entry not found." });
      await db.transaction(async (tx) => {
        await tx.delete(feedback).where(eq(feedback.id, id));
        await tx.insert(adminAuditLog).values({
          actorAccountId: actor.id, action: "feedback_deleted", targetAccountId: null, details: { feedbackId: id },
        });
      });
      return res.status(204).end();
    } catch (error) {
      return errorResponse(res, error, "Could not delete feedback");
    }
  });

  app.use("/admin", async (req, res, next) => {
    const clerkUserId = getAuth(req).userId;
    if (!clerkUserId) return res.redirect("/sign-in?redirect_url=%2Fadmin");
    try {
      const account = await getApplicationAccount(clerkUserId);
      if (account.status === "suspended") return res.status(403).send("This account is suspended.");
      if (account.role !== "owner") return res.status(403).send("Owner access is required.");
      return next();
    } catch {
      return res.status(503).send("Owner administration is temporarily unavailable.");
    }
  });
}
