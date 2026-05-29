import { convertMinutesToHours, capitalizeFirstLetter } from '../../src/utils';

// We test the execute function directly by exporting it bypassing the default export
jest.mock('../../src/utils', () => ({
  convertMinutesToHours: jest.fn((m: number) => `${Math.floor(m / 60)}h ${m % 60}m`),
  capitalizeFirstLetter: jest.fn((s: string) => s.charAt(0).toUpperCase() + s.slice(1)),
}));

describe('messageCreate handler', () => {
  let messageCreate: any;

  beforeAll(async () => {
    const mod = await import('../../src/events/messageCreate');
    messageCreate = mod.default;
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  function makeMessage(overrides: any = {}) {
    return {
      author: { bot: false },
      guild: { id: 'guild_1' },
      content: '/voicetime total',
      reply: jest.fn().mockResolvedValue(undefined),
      ...overrides,
    };
  }

  function makeDb(overrides: any = {}) {
    return {
      getTop: jest.fn().mockResolvedValue([
        { user_id: 'u1', nickname: 'User#0001', time: 120 },
        { user_id: 'u2', nickname: 'User#0002', time: 60 },
      ]),
      ...overrides,
    };
  }

  test('returns early if message is from a bot', async () => {
    const message = makeMessage({ author: { bot: true } });
    const db = makeDb();
    await messageCreate.execute(message, { db });
    expect(message.reply).not.toHaveBeenCalled();
  });

  test('returns early if there is no guild (DM)', async () => {
    const message = makeMessage({ guild: null });
    const db = makeDb();
    await messageCreate.execute(message, { db });
    expect(message.reply).not.toHaveBeenCalled();
  });

  test('returns early if content does not start with /voicetime', async () => {
    const message = makeMessage({ content: '!rank' });
    const db = makeDb();
    await messageCreate.execute(message, { db });
    expect(message.reply).not.toHaveBeenCalled();
  });

  test('returns early if category is invalid', async () => {
    const message = makeMessage({ content: '/voicetime invalidcat' });
    const db = makeDb();
    await messageCreate.execute(message, { db });
    expect(message.reply).not.toHaveBeenCalled();
  });

  test('replies with "No data" when getTop returns empty', async () => {
    const message = makeMessage();
    const db = makeDb({ getTop: jest.fn().mockResolvedValue([]) });
    await messageCreate.execute(message, { db });
    expect(message.reply).toHaveBeenCalledWith('No data found for the specified category.');
  });

  test('calls getTop with correct guild and category, then formats reply', async () => {
    const message = makeMessage({ content: '/voicetime muted' });
    const db = makeDb();
    await messageCreate.execute(message, { db });
    expect(db.getTop).toHaveBeenCalledWith('muted', 10, 'guild_1');
    expect(convertMinutesToHours).toHaveBeenCalledWith(120);
    expect(convertMinutesToHours).toHaveBeenCalledWith(60);
    expect(message.reply).toHaveBeenCalledWith(expect.stringContaining('Top users in the'));
  });

  test('catches errors and logs them instead of crashing', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const message = makeMessage();
    const db = makeDb({ getTop: jest.fn().mockRejectedValue(new Error('DB fail')) });
    await messageCreate.execute(message, { db });
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});
