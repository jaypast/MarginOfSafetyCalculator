import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReportJob } from "@shared/schema";
import {
  MAX_ATTACHMENT_BYTES,
  buildReportEmailHtml,
  getPublicBaseUrl,
  sendReportEmail,
  type ReportEmailSummary,
} from "../server/services/reportEmail";

const job = {
  id: 42,
  email: "owner@example.com",
  listAsOf: "2026-07-22",
  completedAt: new Date("2026-07-22T12:00:00Z"),
} as unknown as ReportJob;

const summary: ReportEmailSummary = {
  scanned: 3000,
  ok: 2800,
  failed: 200,
  buyCandidates: [],
};

const ENV_KEYS = [
  "RESEND_API_KEY",
  "RESEND_FROM_EMAIL",
  "PUBLIC_BASE_URL",
  "REPLIT_DOMAINS",
  "REPLIT_DEV_DOMAIN",
] as const;
let savedEnv: Record<string, string | undefined>;

beforeEach(() => {
  savedEnv = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  for (const k of ENV_KEYS) delete process.env[k];
  process.env.RESEND_API_KEY = "re_test_key";
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
  vi.unstubAllGlobals();
});

function mockResendOk() {
  const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function sentBody(fetchMock: ReturnType<typeof vi.fn>): any {
  const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
  return JSON.parse(init.body as string);
}

describe("report email CSV delivery (attachment vs download-link fallback)", () => {
  it("attaches the CSV when it is under the size cap", async () => {
    const fetchMock = mockResendOk();
    await sendReportEmail(job, summary, "symbol,name\nAAPL,Apple", "report.csv");
    const body = sentBody(fetchMock);
    expect(body.attachments).toHaveLength(1);
    expect(body.attachments[0].filename).toBe("report.csv");
    expect(
      Buffer.from(body.attachments[0].content, "base64").toString("utf8"),
    ).toContain("AAPL");
    expect(body.html).toContain("attached CSV");
    expect(body.html).not.toContain("too large to attach");
  });

  it("falls back to a download link when the CSV exceeds the cap", async () => {
    const fetchMock = mockResendOk();
    const bigCsv = "a".repeat(MAX_ATTACHMENT_BYTES + 1);
    await sendReportEmail(job, summary, bigCsv, "report.csv");
    const body = sentBody(fetchMock);
    expect(body.attachments).toBeUndefined();
    expect(body.html).toContain("too large to attach");
    expect(body.html).toContain("/api/research/report/42/download");
  });

  it("builds an absolute download URL from the deployment domain", async () => {
    process.env.REPLIT_DOMAINS = "myapp.replit.app,other.example.com";
    const fetchMock = mockResendOk();
    const bigCsv = "a".repeat(MAX_ATTACHMENT_BYTES + 1);
    await sendReportEmail(job, summary, bigCsv, "report.csv");
    const body = sentBody(fetchMock);
    expect(body.html).toContain(
      "https://myapp.replit.app/api/research/report/42/download",
    );
  });

  it("measures size in bytes, not characters (multibyte CSV content)", async () => {
    const fetchMock = mockResendOk();
    // Each "é" is 2 bytes in UTF-8 — half the cap in characters exceeds it in bytes.
    const multibyte = "é".repeat(Math.floor(MAX_ATTACHMENT_BYTES / 2) + 1);
    await sendReportEmail(job, summary, multibyte, "report.csv");
    const body = sentBody(fetchMock);
    expect(body.attachments).toBeUndefined();
  });
});

describe("getPublicBaseUrl", () => {
  it("prefers PUBLIC_BASE_URL and strips trailing slashes", () => {
    process.env.PUBLIC_BASE_URL = "https://custom.example.com/";
    process.env.REPLIT_DOMAINS = "myapp.replit.app";
    expect(getPublicBaseUrl()).toBe("https://custom.example.com");
  });

  it("falls back to the first deployment domain, then the dev domain", () => {
    process.env.REPLIT_DOMAINS = "a.replit.app,b.replit.app";
    expect(getPublicBaseUrl()).toBe("https://a.replit.app");
    delete process.env.REPLIT_DOMAINS;
    process.env.REPLIT_DEV_DOMAIN = "dev.replit.dev";
    expect(getPublicBaseUrl()).toBe("https://dev.replit.dev");
  });

  it("returns null when no domain is known", () => {
    expect(getPublicBaseUrl()).toBeNull();
  });
});

describe("buildReportEmailHtml delivery variants", () => {
  it("escapes the download URL in the link fallback", () => {
    const html = buildReportEmailHtml(job, summary, {
      attached: false,
      downloadUrl: "https://x.example/download?a=1&b=2",
    });
    expect(html).toContain("a=1&amp;b=2");
  });

  it("defaults to attachment wording", () => {
    const html = buildReportEmailHtml(job, summary);
    expect(html).toContain("attached CSV");
  });
});
