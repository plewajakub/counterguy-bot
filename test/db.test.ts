import * as db from '../src/db';

describe('db module', () => {
  afterEach(async () => {
    await db.close();
  });

  test('init creates tables and getTop returns empty result', async () => {
    await db.init(':memory:');
    const rows = await db.getTop('total');
    expect(rows).toEqual([]);
  });

  test('addMinutesToUser increments totals correctly', async () => {
    await db.init(':memory:');
    await db.addMinutesToUser('u1', 'User1#0001', 5, true, false, false);
    await db.addMinutesToUser('u1', 'User1#0001', 10, false, true, false);

    const rows = await db.getTop('total');
    expect(rows).toHaveLength(1);
    expect(rows[0].time).toBe(15);

    const muted = await db.getTop('muted');
    expect(muted[0].time).toBe(5);

    const deaf = await db.getTop('deaf');
    expect(deaf[0].time).toBe(10);
  });

  test('endSessionAndAdd closes existing session and adds minutes', async () => {
    await db.init(':memory:');
    const now = Date.now();
    await db.upsertSession('u2', 'A', now - 65 * 60000, false, false, false);
    await db.endSessionAndAdd('u2', 'User2#0002');

    const rows = await db.getTop('total');
    expect(rows[0].time).toBeGreaterThanOrEqual(65);
  });

  test('updateSessionState records previous state time and updates session flags', async () => {
    await db.init(':memory:');
    const now = Date.now();
    await db.upsertSession('u3', 'A', now - 70 * 60000, false, false, false);
    await db.updateSessionState('u3', 'User3#0003', true, false, false);

    const total = await db.getTop('total');
    expect(total[0].time).toBeGreaterThanOrEqual(70);

    const muted = await db.getTop('muted');
    expect(muted).toEqual([]);

    const session = await db.getSession('u3');
    expect(session.is_muted).toBe(1);
  });
});
