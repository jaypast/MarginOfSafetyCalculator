// Email delivery for the Russell 3000 research report (Task #57), via the
// Replit-managed Resend connector.
//
// This module is the single email boundary — the job engine only calls
// sendReportEmail(), so tests mock this module and never touch the network.
//
// Credential flow, in preference order:
//   1. RESEND_API_KEY secret (with optional RESEND_FROM_EMAIL env var) —
//      the user provides their Resend API key directly.
//   2. The Replit-managed Resend connector, fetched at send time.
// Keys are never cached to disk and never logged. If neither source is
// available the send fails loudly and the job lands in 'email_failed' —
// the CSV stays downloadable from the UI.

import type { ReportJob } from "@shared/schema";

const DEFAULT_FROM_EMAIL = "onboarding@resend.dev";

interface ResendCredentials {
  apiKey: string;
  fromEmail: string;
}

async function getResendCredentials(): Promise<ResendCredentials> {
  const envKey = process.env.RESEND_API_KEY;
  if (envKey) {
    return {
      apiKey: envKey,
      fromEmail: process.env.RESEND_FROM_EMAIL || DEFAULT_FROM_EMAIL,
    };
  }

  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY
    ? "repl " + process.env.REPL_IDENTITY
    : process.env.WEB_REPL_RENEWAL
      ? "depl " + process.env.WEB_REPL_RENEWAL
      : null;

  if (!hostname || !xReplitToken) {
    throw new Error("No Resend credentials: set the RESEND_API_KEY secret (or connect the Resend integration)");
  }

  const response = await fetch(
    `https://${hostname}/api/v2/connection?include_secrets=true&connector_names=resend`,
    {
      headers: {
        Accept: "application/json",
        X_REPLIT_TOKEN: xReplitToken,
      },
    },
  );
  if (!response.ok) {
    throw new Error(`Resend connector lookup failed: HTTP ${response.status}`);
  }
  const data = await response.json();
  const settings = data.items?.[0]?.settings;
  const apiKey = settings?.api_key;
  if (!apiKey) {
    throw new Error("No Resend credentials: set the RESEND_API_KEY secret (or connect the Resend integration)");
  }
  return {
    apiKey,
    fromEmail: settings?.from_email || DEFAULT_FROM_EMAIL,
  };
}

// Resend caps total message size at 40MB; base64 inflates attachments by
// ~4/3 and the HTML body adds overhead, so cap the raw CSV well below that.
// Larger CSVs fall back to a download link (spec: "attach the CSV, fall back
// to a download link if the attachment is too large").
export const MAX_ATTACHMENT_BYTES = 15 * 1024 * 1024;

/**
 * Best public base URL for download links in emails. Prefers an explicit
 * PUBLIC_BASE_URL, then the deployment domain, then the dev domain. Returns
 * null when unknown — the email then shows the path with instructions.
 */
export function getPublicBaseUrl(): string | null {
  const explicit = process.env.PUBLIC_BASE_URL;
  if (explicit) return explicit.replace(/\/+$/, "");
  const deployed = process.env.REPLIT_DOMAINS?.split(",")[0]?.trim();
  if (deployed) return `https://${deployed}`;
  const dev = process.env.REPLIT_DEV_DOMAIN?.trim();
  if (dev) return `https://${dev}`;
  return null;
}

export interface CsvDelivery {
  attached: boolean;
  /** Absolute download URL, or a bare path when the host is unknown. */
  downloadUrl: string;
}

export interface ReportEmailSummary {
  scanned: number;
  ok: number;
  failed: number;
  buyCandidates: Array<{
    symbol: string;
    name: string;
    quality: string | null;
    price: number | null;
    intrinsicValue: number | null;
    discountPct: number | null;
  }>;
}

function fmt(n: number | null, prefix = "", suffix = ""): string {
  return n === null || !Number.isFinite(n) ? "—" : `${prefix}${n.toFixed(2)}${suffix}`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function buildReportEmailHtml(
  job: ReportJob,
  summary: ReportEmailSummary,
  delivery: CsvDelivery = { attached: true, downloadUrl: "" },
): string {
  const rows = summary.buyCandidates
    .map(
      (c) => `<tr>
        <td style="padding:4px 12px 4px 0;font-weight:600;">${escapeHtml(c.symbol)}</td>
        <td style="padding:4px 12px 4px 0;">${escapeHtml(c.name)}</td>
        <td style="padding:4px 12px 4px 0;">${escapeHtml(c.quality ?? "—")}</td>
        <td style="padding:4px 12px 4px 0;text-align:right;">${fmt(c.price, "$")}</td>
        <td style="padding:4px 12px 4px 0;text-align:right;">${fmt(c.intrinsicValue, "$")}</td>
        <td style="padding:4px 0;text-align:right;">${c.discountPct === null ? "—" : c.discountPct.toFixed(1) + "%"}</td>
      </tr>`,
    )
    .join("\n");

  const candidatesBlock = summary.buyCandidates.length
    ? `<h3 style="margin:20px 0 8px;">Top buy candidates (quality-screened, ≥10% discount)</h3>
       <table style="border-collapse:collapse;font-size:14px;">
         <tr style="text-align:left;color:#666;">
           <th style="padding:4px 12px 4px 0;">Symbol</th><th style="padding:4px 12px 4px 0;">Company</th>
           <th style="padding:4px 12px 4px 0;">Quality</th><th style="padding:4px 12px 4px 0;">Price</th>
           <th style="padding:4px 12px 4px 0;">Intrinsic</th><th style="padding:4px 0;">Discount</th>
         </tr>
         ${rows}
       </table>`
    : `<p>No quality-screened buy candidates cleared the 10% discount bar in this scan.</p>`;

  return `<div style="font-family:system-ui,-apple-system,sans-serif;max-width:640px;">
    <h2 style="margin:0 0 4px;">Russell 3000 research report</h2>
    <p style="color:#666;margin:0 0 16px;">Constituent list as of ${escapeHtml(job.listAsOf)} · scan finished ${job.completedAt ? new Date(job.completedAt).toUTCString() : ""}</p>
    <p><strong>${summary.scanned.toLocaleString()}</strong> companies scanned —
       ${summary.ok.toLocaleString()} with data, ${summary.failed.toLocaleString()} unavailable,
       <strong>${summary.buyCandidates.length}</strong> buy candidates.</p>
    ${candidatesBlock}
    ${
      delivery.attached
        ? `<p style="margin-top:20px;">The attached CSV covers every company scanned, with per-row data-source
    provenance so you can judge how much weight each line deserves.</p>`
        : `<p style="margin-top:20px;">The full CSV (every company scanned, with per-row data-source provenance)
    was too large to attach. Download it here:
    <a href="${escapeHtml(delivery.downloadUrl)}">${escapeHtml(delivery.downloadUrl)}</a></p>`
    }
    <p style="color:#999;font-size:12px;margin-top:24px;">Estimates are simplified server-side screens, not investment advice.
    Verify anything interesting in the full calculator before acting.</p>
  </div>`;
}

export async function sendReportEmail(
  job: ReportJob,
  summary: ReportEmailSummary,
  csv: string,
  csvFilename: string,
): Promise<void> {
  const { apiKey, fromEmail } = await getResendCredentials();

  const csvBytes = Buffer.byteLength(csv, "utf8");
  const attach = csvBytes <= MAX_ATTACHMENT_BYTES;
  const downloadPath = `/api/research/report/${job.id}/download`;
  const baseUrl = getPublicBaseUrl();
  const delivery: CsvDelivery = {
    attached: attach,
    downloadUrl: baseUrl ? `${baseUrl}${downloadPath}` : downloadPath,
  };

  const payload: Record<string, unknown> = {
    from: `Margin of Safety Calculator <${fromEmail}>`,
    to: [job.email],
    subject: `Russell 3000 research report — ${summary.buyCandidates.length} buy candidates`,
    html: buildReportEmailHtml(job, summary, delivery),
  };
  if (attach) {
    payload.attachments = [
      {
        filename: csvFilename,
        content: Buffer.from(csv, "utf8").toString("base64"),
      },
    ];
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Resend send failed: HTTP ${response.status} ${body.slice(0, 300)}`);
  }
}
