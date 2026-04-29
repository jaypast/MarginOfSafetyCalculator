import { describe, it, expect, beforeEach, vi } from 'vitest';

// `server/storage.ts` initialises a `SafeStorageWrapper` at module-load time
// which (in production) reaches for the database. To keep these tests
// hermetic but still exercise the *real* MemStorage class shipped in
// production, we mock `./db` to be `null`. The SafeStorageWrapper then
// falls through to `MemStorage`, which is the code path under test.
vi.mock('../server/db', () => ({ db: null, pool: null }));

import { MemStorage } from '../server/storage';
import type { InsertFeedback } from '../shared/schema';

function fb(satisfaction: InsertFeedback['satisfaction'], extras: Partial<InsertFeedback> = {}): InsertFeedback {
  return {
    satisfaction,
    feedbackText: extras.feedbackText ?? 'test',
    benefitDescription: extras.benefitDescription ?? null,
    improvementSuggestion: extras.improvementSuggestion ?? null,
    userType: extras.userType ?? null,
    ...extras,
  } as InsertFeedback;
}

describe('MemStorage — feedback PMF math (production code path)', () => {
  let storage: MemStorage;

  beforeEach(() => {
    storage = new MemStorage();
  });

  it('returns a zero-filled stats object when no feedback exists', async () => {
    const stats = await storage.getFeedbackStats();
    expect(stats).toEqual({
      totalResponses: 0,
      veryDisappointed: 0,
      somewhatDisappointed: 0,
      notDisappointed: 0,
      pmfScore: 0,
    });
  });

  it('computes the canonical 40% Sean Ellis PMF score', async () => {
    // 4 of 10 = 40% → the textbook Sean Ellis "you have PMF" threshold.
    for (let i = 0; i < 4; i++) await storage.createFeedback(fb('very_disappointed'));
    for (let i = 0; i < 4; i++) await storage.createFeedback(fb('somewhat_disappointed'));
    for (let i = 0; i < 2; i++) await storage.createFeedback(fb('not_disappointed'));

    const stats = await storage.getFeedbackStats();
    expect(stats.totalResponses).toBe(10);
    expect(stats.veryDisappointed).toBe(4);
    expect(stats.somewhatDisappointed).toBe(4);
    expect(stats.notDisappointed).toBe(2);
    expect(stats.pmfScore).toBeCloseTo(40, 5);
  });

  it('returns 100% when every respondent would be very disappointed', async () => {
    for (let i = 0; i < 3; i++) await storage.createFeedback(fb('very_disappointed'));
    const stats = await storage.getFeedbackStats();
    expect(stats.pmfScore).toBe(100);
  });

  it('returns 0% when no respondent would be very disappointed', async () => {
    await storage.createFeedback(fb('somewhat_disappointed'));
    await storage.createFeedback(fb('not_disappointed'));
    const stats = await storage.getFeedbackStats();
    expect(stats.pmfScore).toBe(0);
  });

  it('createFeedback assigns monotonically increasing ids', async () => {
    const a = await storage.createFeedback(fb('very_disappointed'));
    const b = await storage.createFeedback(fb('somewhat_disappointed'));
    expect(b.id).toBe(a.id + 1);
  });

  it('getAllFeedback returns entries sorted by createdAt', async () => {
    await storage.createFeedback(fb('very_disappointed'));
    await new Promise((r) => setTimeout(r, 5));
    await storage.createFeedback(fb('not_disappointed'));
    const all = await storage.getAllFeedback();
    expect(all).toHaveLength(2);
    const t0 = new Date(all[0].createdAt as any).getTime();
    const t1 = new Date(all[1].createdAt as any).getTime();
    expect(t0).toBeLessThanOrEqual(t1);
  });
});
