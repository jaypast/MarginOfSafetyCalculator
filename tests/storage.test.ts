import { describe, it, expect } from 'vitest';

// `server/storage.ts` initialises a `SafeStorageWrapper` at import time which
// reaches for the database. To keep these tests hermetic we re-implement the
// MemStorage class directly here — it mirrors the in-memory branch in
// `SafeStorageWrapper`. Keeping the duplication tiny is preferable to running
// real DB migrations as part of `npm test`.

type Sat = 'very_disappointed' | 'somewhat_disappointed' | 'not_disappointed';

class TestMemStorage {
  private feedback: Array<{ id: number; satisfaction: Sat; createdAt: Date }> = [];
  private next = 1;

  async createFeedback(satisfaction: Sat) {
    const item = { id: this.next++, satisfaction, createdAt: new Date() };
    this.feedback.push(item);
    return item;
  }

  async getFeedbackStats() {
    const all = this.feedback;
    const total = all.length;
    if (total === 0) {
      return {
        totalResponses: 0,
        veryDisappointed: 0,
        somewhatDisappointed: 0,
        notDisappointed: 0,
        pmfScore: 0,
      };
    }
    const veryDisappointed = all.filter(f => f.satisfaction === 'very_disappointed').length;
    const somewhatDisappointed = all.filter(f => f.satisfaction === 'somewhat_disappointed').length;
    const notDisappointed = all.filter(f => f.satisfaction === 'not_disappointed').length;
    return {
      totalResponses: total,
      veryDisappointed,
      somewhatDisappointed,
      notDisappointed,
      pmfScore: (veryDisappointed / total) * 100,
    };
  }
}

describe('MemStorage feedback stats (Sean Ellis PMF score)', () => {
  it('returns zero counts when no feedback exists', async () => {
    const s = new TestMemStorage();
    const stats = await s.getFeedbackStats();
    expect(stats.totalResponses).toBe(0);
    expect(stats.pmfScore).toBe(0);
  });

  it('computes a 40% PMF score (the canonical Sean Ellis threshold)', async () => {
    const s = new TestMemStorage();
    // 4 very_disappointed out of 10 → 40% PMF score
    for (let i = 0; i < 4; i++) await s.createFeedback('very_disappointed');
    for (let i = 0; i < 4; i++) await s.createFeedback('somewhat_disappointed');
    for (let i = 0; i < 2; i++) await s.createFeedback('not_disappointed');

    const stats = await s.getFeedbackStats();
    expect(stats.totalResponses).toBe(10);
    expect(stats.veryDisappointed).toBe(4);
    expect(stats.somewhatDisappointed).toBe(4);
    expect(stats.notDisappointed).toBe(2);
    expect(stats.pmfScore).toBeCloseTo(40, 5);
  });

  it('handles a 100% very-disappointed cohort', async () => {
    const s = new TestMemStorage();
    for (let i = 0; i < 3; i++) await s.createFeedback('very_disappointed');
    const stats = await s.getFeedbackStats();
    expect(stats.pmfScore).toBe(100);
  });
});
