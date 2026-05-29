import { processVoiceStateUpdate } from '../src/events/voiceStateUpdate';

describe('voiceStateUpdate', () => {
  test('channel switch ends old session and starts a new one', async () => {
    const db = {
      endSessionAndAdd: jest.fn().mockResolvedValue(undefined),
      upsertSession: jest.fn().mockResolvedValue(undefined),
    };

    const oldState = {
      id: '123',
      channelId: 'A',
      selfMute: false,
      selfDeaf: false,
      channel: { members: new Map([['123', {}], ['456', {}]]) },
      member: { user: { tag: 'User#0001' } },
    };
    const newState = {
      id: '123',
      channelId: 'B',
      selfMute: false,
      selfDeaf: false,
      channel: { members: new Map([['123', {}]]) },
      member: { user: { tag: 'User#0001' } },
    };

    await processVoiceStateUpdate(oldState, newState, { client: null, db });

    expect(db.endSessionAndAdd).toHaveBeenCalledWith('123', 'User#0001');
    expect(db.upsertSession).toHaveBeenCalledWith('123', null, 'B', expect.any(Number), false, false, true);
  });

  test('join starts a new session', async () => {
    const db = { upsertSession: jest.fn().mockResolvedValue(undefined) };
    const oldState = { id: '123', channelId: null, selfMute: false, selfDeaf: false, channel: null, member: { user: { tag: 'User#0001' } } };
    const newState = { id: '123', channelId: 'A', selfMute: true, selfDeaf: false, channel: { members: new Map([['123', {}]]) }, member: { user: { tag: 'User#0001' } } };

    await processVoiceStateUpdate(oldState, newState, { client: null, db });

    expect(db.upsertSession).toHaveBeenCalledWith('123', null, 'A', expect.any(Number), true, false, true);
  });

  test('leave ends session and adds minutes', async () => {
    const db = { endSessionAndAdd: jest.fn().mockResolvedValue(undefined) };
    const oldState = { id: '123', channelId: 'A', selfMute: false, selfDeaf: false, channel: { members: new Map([['123', {}]]) }, member: { user: { tag: 'User#0001' } } };
    const newState = { id: '123', channelId: null, selfMute: false, selfDeaf: false, channel: null, member: { user: { tag: 'User#0001' } } };

    await processVoiceStateUpdate(oldState, newState, { client: null, db });

    expect(db.endSessionAndAdd).toHaveBeenCalledWith('123', 'User#0001');
  });

  test('state change in same channel updates session state', async () => {
    const db = { updateSessionState: jest.fn().mockResolvedValue(undefined) };
    const oldState = { id: '123', channelId: 'A', selfMute: false, selfDeaf: false, channel: { members: new Map([['123', {}]]) }, member: { user: { tag: 'User#0001' } } };
    const newState = { id: '123', channelId: 'A', selfMute: true, selfDeaf: false, channel: { members: new Map([['123', {}]]) }, member: { user: { tag: 'User#0001' } } };

    await processVoiceStateUpdate(oldState, newState, { client: null, db });

    expect(db.updateSessionState).toHaveBeenCalledWith('123', 'User#0001', true, false, true);
  });

  test('no database calls when nothing relevant changes', async () => {
    const db = {
      endSessionAndAdd: jest.fn().mockResolvedValue(undefined),
      upsertSession: jest.fn().mockResolvedValue(undefined),
      updateSessionState: jest.fn().mockResolvedValue(undefined),
    };
    const oldState = { id: '123', channelId: 'A', selfMute: false, selfDeaf: false, channel: { members: new Map([['123', {}], ['456', {}]]) }, member: { user: { tag: 'User#0001' } } };
    const newState = { id: '123', channelId: 'A', selfMute: false, selfDeaf: false, channel: { members: new Map([['123', {}], ['456', {}]]) }, member: { user: { tag: 'User#0001' } } };

    await processVoiceStateUpdate(oldState, newState, { client: null, db });

    expect(db.endSessionAndAdd).not.toHaveBeenCalled();
    expect(db.upsertSession).not.toHaveBeenCalled();
    expect(db.updateSessionState).not.toHaveBeenCalled();
  });

  test('user joins channel with existing alone member, existing member is updated to not alone', async () => {
    const db = {
      upsertSession: jest.fn().mockResolvedValue(undefined),
      updateSessionState: jest.fn().mockResolvedValue(undefined),
    };

    const oldState = { id: '456', channelId: null, selfMute: false, selfDeaf: false, channel: null, member: { user: { tag: 'UserB#0002' } } };
    const newState = {
      id: '456',
      channelId: 'A',
      selfMute: false,
      selfDeaf: false,
      channel: {
        members: new Map([
          ['123', { id: '123', user: { tag: 'UserA#0001' }, voice: { selfMute: false, selfDeaf: false } }],
          ['456', { id: '456', user: { tag: 'UserB#0002' }, voice: { selfMute: false, selfDeaf: false } }],
        ]),
      },
      member: { user: { tag: 'UserB#0002' } },
    };

    await processVoiceStateUpdate(oldState, newState, { client: null, db });

    // User B joins:
    expect(db.upsertSession).toHaveBeenCalledWith('456', null, 'A', expect.any(Number), false, false, false);
    // User A (existing member) should be updated because channel size is 2 (not alone):
    expect(db.updateSessionState).toHaveBeenCalledWith('123', 'UserA#0001', false, false, false);
  });
});
