// Email delivery for the Russell 3000 research report (Task #57), via the
// Replit-managed Resend connector.
//
// This module is the single email boundary — the job engine only calls
// sendReportEmail(), so tests mock this module and never touch the network.
//
// Credential flow: the Resend connector stores the API key with Replit's
// connector service; we fetch it at send time (never cached to disk, never
// logged). If the connector isn't set up the send fails loudly and the job
// lands in 'email_failed' — the CSV stays downloadable from the UI.

import type { ReportJob } from "@shared/schema";

interface ResendCredentials {
  apiKey: string;
  fromEmail: string;
}

async function getResendCredentials(): Promise<ResendCredentials> {
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY
    ? "repl " + process.env.REPL_IDENTITY
    : process.env.WEB_REPL_RENEWAL
      ? "depl " + process.env.WEB_REPL_RENEWAL
      : null;

  if (!hostname || !xReplitToken) {
    throw new Error("Resend connector unavailable: not running in a Replit environment with connector support");
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
    throw new Error("Resend connector is not connected (no API key found) — set it up in the Integrations panel");
  }
  return {
    apiKey,
    fromEmail: settings?.from_email || "onboarding@resend.dev",
  };
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

export function buildReportEmailHtml(job: ReportJob, summary: ReportEmailSummary): string {
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
    <p style="margin-top:20px;">The attached CSV covers every company scanned, with per-row data-source
    provenance so you can judge how much weight each line deserves.</p>
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

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: `Margin of Safety Calculator <${fromEmail}>`,
      to: [job.email],
      subject: `Russell 3000 research report — ${summary.buyCandidates.length} buy candidates`,
      html: buildReportEmailHtml(job, summary),
      attachments: [
        {
          filename: csvFilename,
          content: Buffer.from(csv, "utf8").toString("base64"),
        },
      ],
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Resend send failed: HTTP ${response.status} ${body.slice(0, 300)}`);
  }
}
