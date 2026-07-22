// CSV export for the emailed Russell 3000 research report (Task #57).
//
// The CSV covers EVERY scanned company — including tickers whose fetch
// failed — with per-row provenance so the recipient can judge how much to
// trust each line: which upstream source answered, whether the fundamentals
// needed for quality scoring were complete, the quality tier, the intrinsic
// value estimate, and the discount to current price.
//
// The first line is a human-readable metadata line (report date + universe
// as-of date) followed by a blank line and then the standard header row.
// Spreadsheet apps render this fine; the as-of date requirement comes from
// the task spec ("note its as-of date in the CSV").

import type { ReportJob, ReportJobResult } from "@shared/schema";

function csvEscape(value: string): string {
  // Neutralize spreadsheet formula injection: upstream-supplied strings
  // (company names, error messages) could start with =, +, -, or @ and
  // Excel/Sheets would execute them as formulas on open.
  let v = value;
  if (/^[=+\-@\t\r]/.test(v)) {
    v = "'" + v;
  }
  if (/[",\n\r]/.test(v)) {
    return '"' + v.replace(/"/g, '""') + '"';
  }
  return v;
}

function num(value: number | null, digits: number): string {
  return value === null || !Number.isFinite(value) ? "" : value.toFixed(digits);
}

export const CSV_HEADER = [
  "Symbol",
  "Company",
  "Scan Status",
  "Data Source",
  "Fundamentals Complete",
  "Quality",
  "Price",
  "Intrinsic Value",
  "Discount %",
  "Error",
] as const;

export function buildReportCsv(job: ReportJob, results: ReportJobResult[]): string {
  const generatedAt = new Date().toISOString();
  const lines: string[] = [
    `Margin of Safety Calculator — Russell 3000 research report,generated ${generatedAt},Russell 3000 constituent list as of ${job.listAsOf}`,
    "",
    CSV_HEADER.join(","),
  ];

  for (const r of results) {
    lines.push([
      csvEscape(r.symbol),
      csvEscape(r.name),
      csvEscape(r.status),
      csvEscape(r.dataSource ?? ""),
      r.fundamentalsComplete ? "yes" : "no",
      csvEscape(r.quality ?? ""),
      num(r.price, 2),
      num(r.intrinsicValue, 2),
      num(r.discountPct, 1),
      csvEscape(r.error ?? ""),
    ].join(","));
  }

  return lines.join("\n") + "\n";
}

export function reportCsvFilename(job: ReportJob): string {
  const day = (job.completedAt ?? job.createdAt ?? new Date()).toISOString().slice(0, 10);
  return `russell3000-report-${job.id}-${day}.csv`;
}
