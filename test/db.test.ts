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

  test('addMinutesToUser increments totals correctly per guild', async () => {
    await db.init(':memory:');
    await db.addMinutesToUser('u1', 'User1#0001', 5, true, false, false, 'guild1');
    await db.addMinutesToUser('u1', 'User1#0001', 10, false, true, false, 'guild1');

    // same guild -> accumulates
    let rows = await db.getTop('total', 20, 'guild1');
    expect(rows).toHaveLength(1);
    expect(rows[0].time).toBe(15);

    let muted = await db.getTop('muted', 20, 'guild1');
    expect(muted[0].time).toBe(5);

    let deaf = await db.getTop('deaf', 20, 'guild1');
    expect(deaf[0].time).toBe(10);

    // different guild -> separate record
    await db.addMinutesToUser('u1', 'User1#0001', 20, false, false, false, 'guild2');
    rows = await db.getTop('total', 20, 'guild2');
    expect(rows).toHaveLength(1);
    expect(rows[0].time).toBe(20);

    // global leaderboard sees both
    rows = await db.getTop('total', 20);
    expect(rows).toHaveLength(2);
  });

  test('endSessionAndAdd closes existing session and adds minutes', async () => {
    await db.init(':memory:');
    const now = Date.now();
    await db.upsertSession('u2', 'guild1', 'A', now - 65 * 60000, false, false, false);
    await db.endSessionAndAdd('u2', 'User2#0002');

    const rows = await db.getTop('total', 20, 'guild1');
    expect(rows[0].time).toBeGreaterThanOrEqual(65);
  });

  test('updateSessionState records previous state time and updates session flags', async () => {
    await db.init(':memory:');
    const now = Date.now();
    await db.upsertSession('u3', 'guild1', 'A', now - 70 * 60000, false, false, false);
    await db.updateSessionState('u3', 'User3#0003', true, false, false);

    const total = await db.getTop('total', 20, 'guild1');
    expect(total[0].time).toBeGreaterThanOrEqual(70);

    const muted = await db.getTop('muted', 20, 'guild1');
    expect(muted).toEqual([]);

    const session = await db.getSession('u3');
    expect(session.is_muted).toBe(1);
  });

  test('getUserStats returns range totals, average, and last seen', async () => {
    await db.init(':memory:');
    const now = Date.now();
    await db.upsertSession('u4', 'guild1', 'A', now - 90 * 60000, false, false, false);
    await db.endSessionAndAdd('u4', 'User4#0004');
    await db.upsertSession('u4', 'guild1', 'A', now - 50 * 60000, false, false, false);
    await db.endSessionAndAdd('u4', 'User4#0004');

    const stats = await db.getUserStats('u4', 'week', 'guild1');
    expect(stats.totalMinutes).toBeGreaterThanOrEqual(140);
    expect(stats.daysCount).toBeGreaterThanOrEqual(1);
    expect(stats.averageMinutes).toBeGreaterThanOrEqual(70);
    expect(stats.lastSeen).toBeGreaterThan(0);
    expect(stats.maxDayMinutes).toBeGreaterThanOrEqual(90);
  });

  test('getTop filters by guild', async () => {
    await db.init(':memory:');
    await db.addMinutesToUser('u1', 'User1#0001', 10, false, false, false, 'guild1');
    await db.addMinutesToUser('u2', 'User2#0002', 20, false, false, false, 'guild2');
    await db.addMinutesToUser('u1', 'User1#0001', 30, false, false, false, 'guild2');

    const g1 = await db.getTop('total', 20, 'guild1');
    expect(g1).toHaveLength(1);
    expect(g1[0].user_id).toBe('u1');
    expect(g1[0].time).toBe(10);

    const g2 = await db.getTop('total', 20, 'guild2');
    expect(g2).toHaveLength(2);

    const all = await db.getTop('total', 20);
    expect(all).toHaveLength(3);
  });

  test('getTopGames returns most played games across guild', async () => {
    await db.init(':memory:');
    // Insert directly into user_games table via a session lifecycle:
    // We can test getTopGames by simulating game tracking.
    // The game tracking in updateSessionState fires when minutes > 0 and game_name is set.
    // We'll create a session with game_name already set by using updateSessionGame
    // which resets last_updated_at. Instead, let's just verify the table was created
    // and query works by inserting a manual row via SQL through the session system.

    // Create a session, set game via updateSessionGame, then call updateSessionState
    // which will capture the delta from session start (with game) and track it.
    const now = Date.now();
    await db.upsertSession('gamer1', 'guild1', 'A', now - 120 * 60000, false, false, false);
    // Set game on the session (this resets last_updated_at to now)
    await db.updateSessionGame('gamer1', 'Valorant');
    // Now call updateSessionState - this will track ~120 min of Valorant
    await db.updateSessionState('gamer1', 'Gamer#0001', false, false, false);

    const games = await db.getTopGames('guild1');
    expect(games.length).toBeGreaterThanOrEqual(1);
    expect(games[0].game_name).toBe('Valorant');
    expect(games[0].total_minutes).toBeGreaterThanOrEqual(119);
    expect(games[0].player_count).toBeGreaterThanOrEqual(1);
  });

  test('getUserStreaks returns streak data after session', async () => {
    await db.init(':memory:');
    const now = Date.now();

    await db.upsertSession('u_streak', 'guild1', 'A', now - 10 * 60000, false, false, false);
    await db.endSessionAndAdd('u_streak', 'Streaker#0001');

    const streak = await db.getUserStreaks('u_streak', 'guild1');
    expect(streak).not.toBeNull();
    expect(streak.current_streak).toBe(1);
    expect(streak.longest_streak).toBe(1);
  });
});
