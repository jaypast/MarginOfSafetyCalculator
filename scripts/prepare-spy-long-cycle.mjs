import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

// A pinned, publicly inspectable daily SPY snapshot, not a live quote endpoint.
const url =
  "https://raw.githubusercontent.com/OStochastic/Daily-SPY-data-from-2000-2025/db3396f1d5acb614a5af31c499d003d5f10d8c58/spy_data.csv";
const expectedSha256 = "8624abd005c19c1ee57a68af9e1389d93cfc1df33fdd1c1d809ebcbb4c6429e4";
const warmupUrl =
  "https://raw.githubusercontent.com/kannansingaravelu/datasets/a300cd3a7ae19f9fadade552ce29502ca2fce3c4/historical_spy.csv";
const warmupSha256 = "501f0e53983f32ab4075ceb70eb5796486232ab8ed4a063c40551b48810c5202";
const destination = "docs/research/market-regime/spy-2000-2025.csv";

const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
if (!response.ok) throw new Error(`Dataset download failed: HTTP ${response.status}`);
const source = await response.text();
const digest = createHash("sha256").update(source).digest("hex");
if (digest !== expectedSha256) throw new Error(`Dataset checksum mismatch: ${digest}`);

const lines = source.trim().split(/\r?\n/);
if (lines[0] !== "Price,Close,High,Low,Open,Volume" ||
    lines[1] !== "Ticker,SPY,SPY,SPY,SPY,SPY" ||
    lines[2] !== "Date,,,,,") {
  throw new Error("Unexpected source CSV layout");
}
const points = lines.slice(3).map((line) => {
  const [date, close] = line.split(",");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Number(close)) || Number(close) <= 0) {
    throw new Error(`Invalid source row: ${line}`);
  }
  return `${date},${close}`;
});
if (points.length < 6000 || !points[0].startsWith("2000-") || !points.at(-1).startsWith("2025-")) {
  throw new Error("Incomplete long-cycle snapshot");
}

// This archival file is named historical_spy.csv, but its ~1455 price on
// 2000-01-03 identifies S&P 500 *index* closes, not SPY ETF closes. Use it
// only as a pre-2000 feature-training warm-up, never to score a SPY forecast.
const warmupResponse = await fetch(warmupUrl, { signal: AbortSignal.timeout(30_000) });
if (!warmupResponse.ok) throw new Error(`Warm-up download failed: HTTP ${warmupResponse.status}`);
const warmupSource = await warmupResponse.text();
const warmupDigest = createHash("sha256").update(warmupSource).digest("hex");
if (warmupDigest !== warmupSha256) throw new Error(`Warm-up checksum mismatch: ${warmupDigest}`);
const warmupLines = warmupSource.trim().split(/\r?\n/);
if (warmupLines[0] !== "Date,Open,High,Low,Close,Adj Close,Volume") {
  throw new Error("Unexpected warm-up CSV header");
}
const indexRows = warmupLines.slice(1).map((line) => {
  const [rawDate, , , , close] = line.split(",");
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(rawDate);
  const date = match ? `${match[3]}-${match[2]}-${match[1]}` : "";
  return { date, close: Number(close) };
});
const anchor = indexRows.find((row) => row.date === "2000-01-03");
const firstSpy = Number(points[0].split(",")[1]);
if (!anchor || anchor.close <= 0 || !points[0].startsWith("2000-01-03")) {
  throw new Error("Missing shared index/SPY anchor on 2000-01-03");
}
const factor = firstSpy / anchor.close;
const warmup = indexRows
  .filter((row) => row.date >= "1996-11-01" && row.date < "2000-01-01")
  .map((row) => {
    if (!Number.isFinite(row.close) || row.close <= 0) throw new Error(`Invalid warm-up close: ${row.date}`);
    return `${row.date},${row.close * factor}`;
  });
if (warmup.length < 750 || !warmup[0].startsWith("1996-11-")) {
  throw new Error("Insufficient pre-2000 training warm-up");
}
await mkdir(dirname(destination), { recursive: true });
await writeFile(destination, ["date,close", ...warmup, ...points, ""].join("\n"));
console.log(`${destination}: ${warmup.length} index-derived warm-up + ${points.length} SPY closes; source SHA-256 ${digest}, warm-up SHA-256 ${warmupDigest}`);