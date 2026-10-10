import type { NextFunction, Request, Response } from "express";
import { clerkClient, getAuth } from "@clerk/express";
import { eq } from "drizzle-orm";
import { accounts, type Account } from "@shared/schema";
import { db } from "./db";

export interface AccountRequest extends Request {
  appAccount?: Account;
}

type ClerkIdentity = { email: string | null; verified: boolean };
const identityCache = new Map<string, { value: ClerkIdentity; expiresAt: number }>();
const IDENTITY_CACHE_MS = 15_000;

export async function getApplicationAccount(clerkUserId: string): Promise<Account> {
  if (!db) throw new Error("DATABASE_UNAVAILABLE");
  const cached = identityCache.get(clerkUserId);
  let identity = cached && cached.expiresAt > Date.now() ? cached.value : undefined;
  if (!identity) {
    const clerkUser = await clerkClient.users.getUser(clerkUserId);
    const primary = clerkUser.emailAddresses.find(
      (address) => address.id === clerkUser.primaryEmailAddressId,
    );
    identity = {
      email: primary?.emailAddress.toLowerCase() ?? null,
      verified: primary?.verification?.status === "verified",
    };
    identityCache.set(clerkUserId, { value: identity, expiresAt: Date.now() + IDENTITY_CACHE_MS });
  }

  const ownerEmail = process.env.OWNER_EMAIL?.trim().toLowerCase();
  const mayClaimOwner = Boolean(ownerEmail && identity.verified && identity.email === ownerEmail);
  const [existing] = await db.select().from(accounts).where(eq(accounts.clerkUserId, clerkUserId)).limit(1);
  if (!existing) {
    const [created] = await db.insert(accounts).values({
      clerkUserId,
      email: identity.email,
      role: mayClaimOwner ? "owner" : "user",
    }).onConflictDoNothing({ target: accounts.clerkUserId }).returning();
    if (created) return created;
    const [raced] = await db.select().from(accounts).where(eq(accounts.clerkUserId, clerkUserId)).limit(1);
    if (!raced) throw new Error("ACCOUNT_CREATE_FAILED");
    return raced;
  }

  const updates: Partial<typeof accounts.$inferInsert> = {};
  if (existing.email !== identity.email) updates.email = identity.email;
  if (mayClaimOwner && existing.role !== "owner") updates.role = "owner";
  if (Object.keys(updates).length) {
    updates.updatedAt = new Date();
    const [updated] = await db.update(accounts).set(updates).where(eq(accounts.id, existing.id)).returning();
    return updated;
  }
  return existing;
}

export async function requireAccount(req: Request, res: Response, next: NextFunction) {
  const { userId } = getAuth(req);
  if (!userId) return res.status(401).json({ message: "Sign in to use your account." });
  if (!db) return res.status(503).json({ message: "Accounts are temporarily unavailable because storage is offline." });
  try {
    const account = await getApplicationAccount(userId);
    if (account.status === "suspended") {
      return res.status(403).json({ message: "This account is suspended. Contact the site owner for help." });
    }
    (req as AccountRequest).appAccount = account;
    return next();
  } catch (error) {
    console.error("Account lookup failed:", error instanceof Error ? error.message : "unknown error");
    return res.status(503).json({ message: "We couldn't verify your account right now. Please try again." });
  }
}

export function requireOwner(req: Request, res: Response, next: NextFunction) {
  const account = (req as AccountRequest).appAccount;
  if (!account) return res.status(401).json({ message: "Sign in is required." });
  if (account.role !== "owner") return res.status(403).json({ message: "Owner access is required." });
  return next();
}

export function requireSameOrigin(req: Request, res: Response, next: NextFunction) {
  const fetchSite = req.get("sec-fetch-site");
  if (fetchSite === "cross-site") return res.status(403).json({ message: "Cross-site requests are not allowed." });
  const origin = req.get("origin");
  if (origin) {
    try {
      const originHost = new URL(origin).host;
      const forwarded = req.get("x-forwarded-host")?.split(",")[0]?.trim();
      const requestHost = forwarded || req.get("host");
      if (originHost !== requestHost) {
        return res.status(403).json({ message: "Cross-site requests are not allowed." });
      }
    } catch {
      return res.status(403).json({ message: "Invalid request origin." });
    }
  }
  return next();
}

