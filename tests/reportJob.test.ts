// Tests for the emailed Russell 3000 report job (Task #57).
//
// Everything external is mocked: the DB (MemStorage via mocked ../server/storage
// — NEVER let getStockData tests touch the real dev DB), the stock data
// pipeline, the email module, and the 3,000-ticker list (shrunk to 5 so the
// fake-timer loops stay fast).

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../server/db', () => ({ db: null, pool: null }));

vi.mock('../server/storage', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../server/storage')>();
  return { ...mod, storage: new mod.MemStorage() };
});

vi.mock('../server/services/stockData', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../server/services/stockData')>();
  return { ...mod, getStockData: vi.fn() };
});

vi.mock('../server/services/reportEmail', () => ({
  sendReportEmail: vi.fn(),
}));

vi.mock('../server/data/russell3000', () => ({
  RUSSELL_3000_AS_OF: '2026-07-22',
  RUSSELL_3000: [
    { symbol: 'AAA', name: 'Alpha Corp' },
    { symbol: 'BBB', name: 'Bravo Inc' },
    { symbol: 'CCC', name: 'Charlie Co, Ltd.' },
    { symbol: 'DDD', name: 'Delta "Quotes" Holdings' },
    { symbol: 'EEE', name: 'Echo PLC' },
  ],
}));

import { storage } from '../server/storage';
import { getStockData } from '../server/services/stockData';
import { sendReportEmail } from '../server/services/reportEmail';
import { RUSSELL_3000, RUSSELL_3000_AS_OF } from '../server/data/russell3000';
import {
  kickReportRunner,
  resumeReportJobsOnBoot,
  summarizeResults,
  maskEmail,
  toStatusPayload,
  TICKER_PACE_MS,
  PER_TICKER_TIMEOUT_MS,
} from '../server/services/reportJob';
import { buildReportCsv, reportCsvFilename, CSV_HEADER } from '../server/services/reportCsv';
import type { ReportJob, ReportJobResult, StockResponse } from '../shared/schema';
import { createReportRequestSchema } from '../shared/schema';

const mockedGetStockData = vi.mocked(getStockData);
const mockedSendEmail = vi.mocked(sendReportEmail);

function goodStock(symbol: string, overrides: Partial<StockResponse> = {}): StockResponse {
  return {
    symbol,
    name: `${symbol} Company`,
    price: 100,
    eps: 8,
    peRatio: 12.5,
    fcfPerShare: 9,
    growthRate: 8,
    roe: 25,
    debtToEquity: 0.3,
    currentRatio: 2.0,
    dataSource: 'yfinance',
    fetchedAt: new Date().toISOString(),
    ...overrides,
  } as StockResponse;
}

async function createJob(email = 'jane.doe@example.com'): Promise<ReportJob> {
  return storage.createReportJob(email, RUSSELL_3000.length, RUSSELL_3000_AS_OF);
}

// Drives the engine to completion under fake timers.
async function drain(): Promise<void> {
  await vi.runAllTimersAsync();
}

describe('report job engine', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockedGetStockData.mockReset();
    mockedSendEmail.mockReset();
    mockedSendEmail.mockResolvedValue(undefined);
    mockedGetStockData.mockImplementation(async (symbol: string) => goodStock(symbol));
  });

  afterEach(async () => {
    // Never leave a runner mid-flight — the module-level single-runner guard
    // would silently no-op the next test's kick.
    await vi.runAllTimersAsync();
    vi.useRealTimers();
  });

  it('scans every ticker, persists one row each, emails and marks the job sent', async () => {
    const job = await createJob();
    kickReportRunner(job);
    await drain();

    const rows = await storage.listReportJobResults(job.id);
    expect(rows).toHaveLength(5);
    expect(rows.map(r => r.symbol)).toEqual(['AAA', 'BBB', 'CCC', 'DDD', 'EEE']);
    expect(rows.every(r => r.status === 'ok')).toBe(true);
    expect(rows[0].dataSource).toBe('yfinance');
    expect(rows[0].fundamentalsComplete).toBe(true);
    expect(rows[0].quality).toBe('Exceptional');
    expect(rows[0].price).toBe(100);
    expect(rows[0].intrinsicValue).toBeGreaterThan(0);

    expect(mockedSendEmail).toHaveBeenCalledTimes(1);
    const [emailJob, summary, csv, filename] = mockedSendEmail.mock.calls[0];
    expect(emailJob.email).toBe('jane.doe@example.com');
    expect(summary.scanned).toBe(5);
    expect(csv).toContain('AAA');
    expect(filename).toMatch(/^russell3000-report-\d+-\d{4}-\d{2}-\d{2}\.csv$/);

    const finished = await storage.getReportJob(job.id);
    expect(finished?.status).toBe('sent');
    expect(finished?.completedAt).toBeInstanceOf(Date);
    expect(finished?.emailedAt).toBeInstanceOf(Date);
  });

  it('paces tickers TICKER_PACE_MS apart (never hammers the upstream)', async () => {
    const job = await createJob();
    kickReportRunner(job);

    await vi.advanceTimersByTimeAsync(0);
    expect(mockedGetStockData).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(TICKER_PACE_MS - 1);
    expect(mockedGetStockData).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1);
    expect(mockedGetStockData).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(TICKER_PACE_MS);
    expect(mockedGetStockData).toHaveBeenCalledTimes(3);
  });

  it('resumes from the persisted checkpoint instead of starting over', async () => {
    const job = await createJob();
    // Simulate a previous run that got through the first 3 tickers.
    for (const symbol of ['AAA', 'BBB', 'CCC']) {
      await storage.addReportJobResult({
        jobId: job.id, symbol, name: symbol, status: 'ok',
        dataSource: 'yfinance', fundamentalsComplete: true, quality: 'Good',
        price: 50, intrinsicValue: 60, discountPct: 16.7, error: null,
      });
    }

    kickReportRunner(job);
    await drain();

    // Only the remaining two tickers were fetched.
    expect(mockedGetStockData.mock.calls.map(c => c[0])).toEqual(['DDD', 'EEE']);
    const rows = await storage.listReportJobResults(job.id);
    expect(rows).toHaveLength(5);
    expect((await storage.getReportJob(job.id))?.status).toBe('sent');
    // Email covers all 5, not just the resumed tail.
    expect(mockedSendEmail.mock.calls[0][1].scanned).toBe(5);
  });

  it('resumeReportJobsOnBoot picks up an interrupted job', async () => {
    const job = await createJob();
    await storage.updateReportJob(job.id, { status: 'running' });

    await resumeReportJobsOnBoot();
    await drain();

    expect((await storage.getReportJob(job.id))?.status).toBe('sent');
    expect(await storage.countReportJobResults(job.id)).toBe(5);
  });

  it('records failed tickers as rows and keeps scanning', async () => {
    mockedGetStockData.mockImplementation(async (symbol: string) => {
      if (symbol === 'BBB') throw new Error('upstream exploded');
      return goodStock(symbol);
    });

    const job = await createJob();
    kickReportRunner(job);
    await drain();

    const rows = await storage.listReportJobResults(job.id);
    expect(rows).toHaveLength(5);
    const failed = rows.find(r => r.symbol === 'BBB');
    expect(failed?.status).toBe('failed');
    expect(failed?.error).toBe('upstream exploded');
    expect(failed?.name).toBe('Bravo Inc'); // falls back to the list name
    expect((await storage.getReportJob(job.id))?.status).toBe('sent');
    expect(mockedSendEmail.mock.calls[0][1].failed).toBe(1);
  });

  it('times out hung fetches after PER_TICKER_TIMEOUT_MS and moves on', async () => {
    mockedGetStockData.mockImplementation((symbol: string) => {
      if (symbol === 'AAA') return new Promise(() => {}) as Promise<StockResponse>; // hangs forever
      return Promise.resolve(goodStock(symbol));
    });

    const job = await createJob();
    kickReportRunner(job);
    await vi.advanceTimersByTimeAsync(PER_TICKER_TIMEOUT_MS);
    await drain();

    const rows = await storage.listReportJobResults(job.id);
    expect(rows.find(r => r.symbol === 'AAA')?.status).toBe('failed');
    expect(rows.find(r => r.symbol === 'AAA')?.error).toContain('timed out');
    expect(rows).toHaveLength(5);
    expect((await storage.getReportJob(job.id))?.status).toBe('sent');
  });

  it('marks the job email_failed (not failed) when the send fails — CSV rows stay intact', async () => {
    mockedSendEmail.mockRejectedValue(new Error('Resend send failed: HTTP 403'));

    const job = await createJob();
    kickReportRunner(job);
    await drain();

    const finished = await storage.getReportJob(job.id);
    expect(finished?.status).toBe('email_failed');
    expect(finished?.error).toContain('Resend send failed');
    expect(finished?.completedAt).toBeInstanceOf(Date);
    expect(await storage.countReportJobResults(job.id)).toBe(5);
  });

  it('marks the job failed on an unrecoverable storage error', async () => {
    const spy = vi.spyOn(storage, 'addReportJobResult').mockRejectedValueOnce(new Error('db gone'));

    const job = await createJob();
    kickReportRunner(job);
    await drain();

    expect((await storage.getReportJob(job.id))?.status).toBe('failed');
    expect((await storage.getReportJob(job.id))?.error).toBe('db gone');
    expect(mockedSendEmail).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('sweeps up a queued job stranded by a concurrent request once the active run finishes', async () => {
    const job1 = await createJob('first@example.com');
    kickReportRunner(job1);
    await vi.advanceTimersByTimeAsync(0); // job1 is now mid-flight

    // Simulates the TOCTOU race: a second POST passed the route's active-job
    // check before job1 flipped to running, so its kick no-ops.
    const job2 = await createJob('second@example.com');
    kickReportRunner(job2);
    expect((await storage.getReportJob(job2.id))?.status).toBe('queued');

    await drain();

    expect((await storage.getReportJob(job1.id))?.status).toBe('sent');
    expect((await storage.getReportJob(job2.id))?.status).toBe('sent');
    expect(await storage.countReportJobResults(job2.id)).toBe(5);
    expect(mockedSendEmail).toHaveBeenCalledTimes(2);
  });

  it('re-scanning a replayed ticker is a no-op thanks to the (jobId, symbol) unique guard', async () => {
    const job = await createJob();
    const row = {
      jobId: job.id, symbol: 'AAA', name: 'Alpha Corp', status: 'ok' as const,
      dataSource: 'yfinance', fundamentalsComplete: true, quality: 'Good',
      price: 50, intrinsicValue: 60, discountPct: 16.7, error: null,
    };
    await storage.addReportJobResult(row);
    await storage.addReportJobResult({ ...row, price: 999 }); // replay
    const rows = await storage.listReportJobResults(job.id);
    expect(rows.filter(r => r.symbol === 'AAA')).toHaveLength(1);
    expect(rows[0].price).toBe(50); // first write wins
  });
});

describe('summarizeResults', () => {
  function row(overrides: Partial<ReportJobResult>): ReportJobResult {
    return {
      id: 1, jobId: 1, symbol: 'X', name: 'X Co', status: 'ok',
      dataSource: 'yfinance', fundamentalsComplete: true, quality: 'Good',
      price: 100, intrinsicValue: 120, discountPct: 16.7, error: null,
      ...overrides,
    } as ReportJobResult;
  }

  it('counts ok/failed and picks quality-screened candidates at ≥10% discount', () => {
    const results = [
      row({ symbol: 'BUY1', discountPct: 25 }),
      row({ symbol: 'BUY2', discountPct: 12 }),
      row({ symbol: 'THIN', discountPct: 9.9 }),            // below the bar
      row({ symbol: 'NOQ', quality: null, discountPct: 40 }), // no quality tier
      row({ symbol: 'DEAD', status: 'failed', quality: null, discountPct: null }),
    ];
    const summary = summarizeResults(results);
    expect(summary.scanned).toBe(5);
    expect(summary.ok).toBe(4);
    expect(summary.failed).toBe(1);
    expect(summary.buyCandidates.map(c => c.symbol)).toEqual(['BUY1', 'BUY2']);
  });

  it('caps candidates at 10, sorted by discount descending', () => {
    const results = Array.from({ length: 15 }, (_, i) =>
      row({ symbol: `S${i}`, discountPct: 10 + i }),
    );
    const summary = summarizeResults(results);
    expect(summary.buyCandidates).toHaveLength(10);
    expect(summary.buyCandidates[0].symbol).toBe('S14');
    expect(summary.buyCandidates[9].symbol).toBe('S5');
  });
});

describe('maskEmail', () => {
  it('masks the local part but keeps first/last char and domain', () => {
    expect(maskEmail('jane.doe@example.com')).toBe('j******e@example.com');
    expect(maskEmail('jo@example.com')).toBe('j***@example.com');
    expect(maskEmail('a@b.co')).toBe('a***@b.co');
    expect(maskEmail('not-an-email')).toBe('***');
  });

  it('never leaks the full local part for short names', () => {
    const masked = maskEmail('bob@x.io');
    expect(masked).not.toContain('bob');
    expect(masked.endsWith('@x.io')).toBe(true);
  });
});

describe('toStatusPayload', () => {
  it('masks the email and reports the persisted scan count', async () => {
    const job = await storage.createReportJob('secret.person@corp.com', 3000, '2026-07-22');
    await storage.addReportJobResult({
      jobId: job.id, symbol: 'ZZZ', name: 'Z', status: 'ok',
      dataSource: null, fundamentalsComplete: false, quality: null,
      price: null, intrinsicValue: null, discountPct: null, error: null,
    });
    const payload = await toStatusPayload(job);
    expect(payload.maskedEmail).not.toContain('secret.person');
    expect(payload.maskedEmail.endsWith('@corp.com')).toBe(true);
    expect(payload.scanned).toBe(1);
    expect(payload.total).toBe(3000);
    expect(payload.listAsOf).toBe('2026-07-22');
    expect(payload.status).toBe('queued');
  });
});

describe('buildReportCsv', () => {
  const job = {
    id: 42, email: 'x@y.z', status: 'sent', totalTickers: 2, listAsOf: '2026-07-22',
    error: null, createdAt: new Date('2026-07-22T10:00:00Z'),
    completedAt: new Date('2026-07-22T15:00:00Z'), emailedAt: null,
  } as ReportJob;

  const okRow = {
    id: 1, jobId: 42, symbol: 'CCC', name: 'Charlie Co, Ltd.', status: 'ok',
    dataSource: 'fmp', fundamentalsComplete: true, quality: 'Good',
    price: 123.456, intrinsicValue: 150.5, discountPct: 17.97, error: null,
  } as ReportJobResult;

  const failedRow = {
    id: 2, jobId: 42, symbol: 'DDD', name: 'Delta "Quotes" Holdings', status: 'failed',
    dataSource: null, fundamentalsComplete: false, quality: null,
    price: null, intrinsicValue: null, discountPct: null, error: 'DDD timed out after 8000ms',
  } as ReportJobResult;

  it('stamps the universe as-of date in the metadata line', () => {
    const csv = buildReportCsv(job, [okRow]);
    const firstLine = csv.split('\n')[0];
    expect(firstLine).toContain('Russell 3000 constituent list as of 2026-07-22');
  });

  it('includes the header and one line per result, with provenance columns', () => {
    const csv = buildReportCsv(job, [okRow, failedRow]);
    const lines = csv.trim().split('\n');
    expect(lines[2]).toBe(CSV_HEADER.join(','));
    expect(lines).toHaveLength(5); // metadata + blank + header + 2 rows
    expect(lines[3]).toBe('CCC,"Charlie Co, Ltd.",ok,fmp,yes,Good,123.46,150.50,18.0,');
  });

  it('escapes quotes and records failed rows with their error', () => {
    const csv = buildReportCsv(job, [failedRow]);
    const line = csv.trim().split('\n')[3];
    expect(line).toContain('"Delta ""Quotes"" Holdings"');
    expect(line).toContain('failed');
    expect(line).toContain('DDD timed out after 8000ms');
  });

  it('neutralizes spreadsheet formula injection in upstream-supplied strings', () => {
    const evil = {
      ...okRow, id: 3, symbol: 'EVIL', name: '=cmd|/c calc!A1',
      error: null,
    } as ReportJobResult;
    const csv = buildReportCsv(job, [evil]);
    const line = csv.trim().split('\n')[3];
    expect(line).toContain("'=cmd|/c calc!A1");
    expect(line).not.toMatch(/,=cmd/);
  });

  it('names the file after the job id and completion day', () => {
    expect(reportCsvFilename(job)).toBe('russell3000-report-42-2026-07-22.csv');
  });
});

describe('createReportRequestSchema', () => {
  it('accepts a plain email and trims whitespace', () => {
    const parsed = createReportRequestSchema.parse({ email: '  user@example.com  ' });
    expect(parsed.email).toBe('user@example.com');
  });

  it('rejects junk', () => {
    expect(createReportRequestSchema.safeParse({ email: 'nope' }).success).toBe(false);
    expect(createReportRequestSchema.safeParse({}).success).toBe(false);
    expect(createReportRequestSchema.safeParse({ email: 'a'.repeat(250) + '@b.com' }).success).toBe(false);
  });
});
