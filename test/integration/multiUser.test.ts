import * as db from '../../src/db';
import { processVoiceStateUpdate } from '../../src/events/voiceStateUpdate';

describe('integration: multiple users scenarios', () => {
  afterEach(async () => {
    await db.close();
  });

  test('user moves between channels and times sum correctly', async () => {
    await db.init(':memory:');
    const now = Date.now();

    // Simulate user X: 30min in A then 60min in B
    await db.upsertSession('x', 'A', now - (30 + 60) * 60000, false, false, false);
    // switch to B -> endSessionAndAdd should add 30
    await processVoiceStateUpdate({ id: 'x', channelId: 'A', member: { user: { tag: 'X#0001' } }, selfMute: false, selfDeaf: false, channel: { members: new Map([['x', {}], ['z', {}]]) } }, { id: 'x', channelId: 'B', member: { user: { tag: 'X#0001' } }, selfMute: false, selfDeaf: false, channel: { members: new Map([['x', {}]]) } }, { client: null, db });
    // Manually set session start for B to 60 minutes ago
    await db.upsertSession('x', 'B', now - 60 * 60000, false, false, false);
    await db.endSessionAndAdd('x', 'X#0001');

    const total = await db.getTop('total');
    expect(total.find((r: any) => r.user_id === 'x').time).toBeGreaterThanOrEqual(90);
  });

  test('multiple users in same channel aggregate correctly', async () => {
    await db.init(':memory:');
    const now = Date.now();

    // User A: 20 minutes active
    await db.upsertSession('a', 'A', now - 20 * 60000, false, false, false);
    await db.endSessionAndAdd('a', 'A#0001');

    // User B: 40 minutes muted
    await db.upsertSession('b', 'A', now - 40 * 60000, true, false, false);
    await db.endSessionAndAdd('b', 'B#0002');

    const total = await db.getTop('total');
    expect(total.find((r: any) => r.user_id === 'a').time).toBeGreaterThanOrEqual(20);
    expect(total.find((r: any) => r.user_id === 'b').time).toBeGreaterThanOrEqual(40);

    const muted = await db.getTop('muted');
    expect(muted.find((r: any) => r.user_id === 'b').time).toBeGreaterThanOrEqual(40);
  });
});
