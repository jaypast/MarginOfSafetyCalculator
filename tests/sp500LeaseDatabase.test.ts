import { describe, expect, it } from 'vitest';
import { DatabaseStorage } from '../server/storage';

const runDatabaseIntegration = process.env.RUN_DATABASE_INTEGRATION === '1';

describe.skipIf(!process.env.DATABASE_URL || !runDatabaseIntegration)(
  'S&P 500 PostgreSQL refresh lease coordination',
  () => {
    it('allows one concurrent owner, supports expiry takeover, and rejects stale owners', async () => {
      const storageA = new DatabaseStorage();
      const storageB = new DatabaseStorage();
      const refreshDate = '2999-01-02';
      const now = new Date('2999-01-02T12:00:00.000Z');
      const expiresAt = new Date('2999-01-02T12:30:00.000Z');
      const ownerA = 'database-test-owner-a';
      const ownerB = 'database-test-owner-b';
      const replacementOwner = 'database-test-owner-c';

      try {
        await storageA.releaseSp500RefreshLease(refreshDate, ownerA);
        await storageA.releaseSp500RefreshLease(refreshDate, ownerB);
        await storageA.releaseSp500RefreshLease(refreshDate, replacementOwner);

        const acquisitions = await Promise.all([
          storageA.acquireSp500RefreshLease(refreshDate, ownerA, expiresAt, now),
          storageB.acquireSp500RefreshLease(refreshDate, ownerB, expiresAt, now),
        ]);
        expect(acquisitions.filter(Boolean)).toHaveLength(1);

        const current = await storageA.getSp500RefreshLease(refreshDate);
        expect(current?.ownerToken).toBe(acquisitions[0] ? ownerA : ownerB);

        const later = new Date('2999-01-02T12:31:00.000Z');
        expect(
          await storageA.acquireSp500RefreshLease(
            refreshDate,
            replacementOwner,
            new Date('2999-01-02T13:00:00.000Z'),
            later,
          ),
        ).toBe(true);
        expect((await storageB.getSp500RefreshLease(refreshDate))?.ownerToken).toBe(replacementOwner);

        const staleOwner = acquisitions[0] ? ownerB : ownerA;
        expect(
          await storageA.renewSp500RefreshLease(
            refreshDate,
            staleOwner,
            new Date('2999-01-02T13:30:00.000Z'),
          ),
        ).toBe(false);
        await storageB.releaseSp500RefreshLease(refreshDate, staleOwner);
        expect((await storageA.getSp500RefreshLease(refreshDate))?.ownerToken).toBe(replacementOwner);
      } finally {
        await storageA.releaseSp500RefreshLease(refreshDate, ownerA);
        await storageA.releaseSp500RefreshLease(refreshDate, ownerB);
        await storageA.releaseSp500RefreshLease(refreshDate, replacementOwner);
      }
    });
  },
);