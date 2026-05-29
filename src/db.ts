import fs from 'fs';
import sqlite3 from 'sqlite3';
import { promisify } from 'util';

let _db: any;

export async function init(filename: string, opts?: { backupOnStart?: boolean }) {
  if (filename !== ':memory:' && opts?.backupOnStart && fs.existsSync(filename)) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFilename = `${filename}.backup.${timestamp}`;
    fs.copyFileSync(filename, backupFilename);
    console.log(`Backed up database to ${backupFilename}`);
  }

  _db = new sqlite3.Database(filename);
  _db.runAsync = promisify(_db.run.bind(_db));
  _db.getAsync = promisify(_db.get.bind(_db));
  _db.allAsync = promisify(_db.all.bind(_db));

  await _db.runAsync(`
    CREATE TABLE IF NOT EXISTS voice_data (
      user_id TEXT PRIMARY KEY,
      nickname TEXT,
      guild_id TEXT,
      total_time INTEGER DEFAULT 0,
      muted_time INTEGER DEFAULT 0,
      deafened_time INTEGER DEFAULT 0,
      alone_time INTEGER DEFAULT 0,
      active_time INTEGER DEFAULT 0
    )
  `);

  await _db.runAsync(`
    CREATE TABLE IF NOT EXISTS voice_sessions (
      user_id TEXT PRIMARY KEY,
      guild_id TEXT,
      channel_id TEXT,
      started_at INTEGER,
      last_updated_at INTEGER,
      is_muted INTEGER DEFAULT 0,
      is_deaf INTEGER DEFAULT 0,
      is_alone INTEGER DEFAULT 0
    )
  `);

  await _db.runAsync(`
    CREATE TABLE IF NOT EXISTS voice_sessions_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT,
      guild_id TEXT,
      channel_id TEXT,
      started_at INTEGER,
      ended_at INTEGER,
      duration_minutes INTEGER,
      is_muted INTEGER DEFAULT 0,
      is_deaf INTEGER DEFAULT 0,
      is_alone INTEGER DEFAULT 0
    )
  `);
}

export async function upsertSession(
  userId: string,
  guildId: string | null,
  channelId: string | null,
  ts: number | null,
  isMuted: boolean,
  isDeaf: boolean,
  isAlone: boolean
) {
  await _db.runAsync(
    `INSERT OR REPLACE INTO voice_sessions (user_id, guild_id, channel_id, started_at, last_updated_at, is_muted, is_deaf, is_alone)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    userId,
    guildId || null,
    channelId || null,
    ts || null,
    ts || null,
    isMuted ? 1 : 0,
    isDeaf ? 1 : 0,
    isAlone ? 1 : 0
  );
}

export async function clearSession(userId: string) {
  await _db.runAsync(`DELETE FROM voice_sessions WHERE user_id = ?`, userId);
}

export async function getSession(userId: string) {
  return _db.getAsync(`SELECT * FROM voice_sessions WHERE user_id = ?`, userId);
}

export async function addMinutesToUser(
  userId: string,
  nickname: string,
  minutes: number,
  isMuted: boolean,
  isDeaf: boolean,
  isAlone: boolean,
  guildId: string | null = null
) {
  if (minutes <= 0) return;
  const totalInc = minutes;
  const mutedInc = isMuted ? minutes : 0;
  const deafInc = isDeaf ? minutes : 0;
  const aloneInc = isAlone ? minutes : 0;
  const activeInc = !isMuted && !isDeaf && !isAlone ? minutes : 0;

  await _db.runAsync(
    `INSERT INTO voice_data (user_id, nickname, guild_id, total_time, muted_time, deafened_time, alone_time, active_time)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET
       nickname = excluded.nickname,
       guild_id = excluded.guild_id,
       total_time = voice_data.total_time + excluded.total_time,
       muted_time = voice_data.muted_time + excluded.muted_time,
       deafened_time = voice_data.deafened_time + excluded.deafened_time,
       alone_time = voice_data.alone_time + excluded.alone_time,
       active_time = voice_data.active_time + excluded.active_time`,
    userId,
    nickname,
    guildId || null,
    totalInc,
    mutedInc,
    deafInc,
    aloneInc,
    activeInc
  );
}

async function archiveSessionRecord(
  userId: string,
  guildId: string | null,
  channelId: string | null,
  startedAt: number,
  endedAt: number,
  durationMinutes: number,
  isMuted: boolean,
  isDeaf: boolean,
  isAlone: boolean
) {
  await _db.runAsync(
    `INSERT INTO voice_sessions_history (user_id, guild_id, channel_id, started_at, ended_at, duration_minutes, is_muted, is_deaf, is_alone)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    userId,
    guildId || null,
    channelId || null,
    startedAt,
    endedAt,
    durationMinutes,
    isMuted ? 1 : 0,
    isDeaf ? 1 : 0,
    isAlone ? 1 : 0
  );
}

export async function endSessionAndAdd(userId: string, nickname: string) {
  const session = await getSession(userId);
  if (!session || !session.last_updated_at || !session.started_at) return;
  const now = Date.now();
  const deltaMs = now - session.last_updated_at;
  const minutes = Math.floor(deltaMs / 60000);
  if (minutes > 0) {
    await addMinutesToUser(userId, nickname, minutes, !!session.is_muted, !!session.is_deaf, !!session.is_alone, session.guild_id);
  }
  const durationMinutes = Math.floor((now - session.started_at) / 60000);
  await archiveSessionRecord(
    userId,
    session.guild_id,
    session.channel_id,
    session.started_at,
    now,
    durationMinutes,
    !!session.is_muted,
    !!session.is_deaf,
    !!session.is_alone
  );
  await clearSession(userId);
}

export async function updateSessionState(
  userId: string,
  nickname: string,
  isMuted: boolean,
  isDeaf: boolean,
  isAlone: boolean
) {
  const session = await getSession(userId);
  const now = Date.now();
  if (session && session.last_updated_at) {
    const deltaMs = now - session.last_updated_at;
    const minutes = Math.floor(deltaMs / 60000);
    if (minutes > 0) {
      await addMinutesToUser(userId, nickname, minutes, !!session.is_muted, !!session.is_deaf, !!session.is_alone, session.guild_id);
    }
  }

  await _db.runAsync(
    `INSERT OR REPLACE INTO voice_sessions (user_id, guild_id, channel_id, started_at, last_updated_at, is_muted, is_deaf, is_alone)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    userId,
    session ? session.guild_id : null,
    session ? session.channel_id : null,
    session ? session.started_at : now,
    now,
    isMuted ? 1 : 0,
    isDeaf ? 1 : 0,
    isAlone ? 1 : 0
  );
}

export async function getTop(category: string, limit = 20) {
  const col = (() => {
    switch ((category || '').toLowerCase()) {
      case 'total':
        return 'total_time';
      case 'muted':
        return 'muted_time';
      case 'deaf':
        return 'deafened_time';
      case 'alone':
        return 'alone_time';
      case 'active':
        return 'active_time';
      default:
        return 'total_time';
    }
  })();

  return _db.allAsync(`SELECT user_id, nickname, ${col} as time FROM voice_data WHERE ${col} > 0 ORDER BY ${col} DESC LIMIT ?`, limit);
}

function getRangeStartTimestamp(range: string): number {
  const now = Date.now();
  switch ((range || '').toLowerCase()) {
    case 'today': {
      const today = new Date(now);
      today.setUTCHours(0, 0, 0, 0);
      return today.getTime();
    }
    case 'week':
      return now - 7 * 24 * 60 * 60 * 1000;
    case 'month':
      return now - 30 * 24 * 60 * 60 * 1000;
    case 'year':
      return now - 365 * 24 * 60 * 60 * 1000;
    default:
      return 0;
  }
}

export async function getUserRangeTotal(userId: string, range: string, guildId: string | null = null) {
  const params: any[] = [userId];
  let query = `SELECT COALESCE(SUM(duration_minutes), 0) AS total FROM voice_sessions_history WHERE user_id = ?`;

  if (range !== 'total') {
    const start = getRangeStartTimestamp(range);
    query += ' AND ended_at BETWEEN ? AND ?';
    params.push(start, Date.now());
  }

  if (guildId) {
    query += ' AND guild_id = ?';
    params.push(guildId);
  }

  return _db.getAsync(query, ...params);
}

export async function getUserDailyAggregate(userId: string, range: string, guildId: string | null = null) {
  const params: any[] = [userId];
  let query = `SELECT strftime('%Y-%m-%d', ended_at / 1000, 'unixepoch') AS day, SUM(duration_minutes) AS total FROM voice_sessions_history WHERE user_id = ?`;

  if (range !== 'total') {
    const start = getRangeStartTimestamp(range);
    query += ' AND ended_at BETWEEN ? AND ?';
    params.push(start, Date.now());
  }

  if (guildId) {
    query += ' AND guild_id = ?';
    params.push(guildId);
  }

  query += ' GROUP BY day HAVING SUM(duration_minutes) > 0';
  return _db.allAsync(query, ...params);
}

export async function getUserLastSeen(userId: string, guildId: string | null = null) {
  const session = await getSession(userId);
  if (session && session.last_updated_at) {
    return session.last_updated_at;
  }

  const params: any[] = [userId];
  let query = `SELECT ended_at FROM voice_sessions_history WHERE user_id = ?`;
  if (guildId) {
    query += ' AND guild_id = ?';
    params.push(guildId);
  }
  query += ' ORDER BY ended_at DESC LIMIT 1';

  const row = await _db.getAsync(query, ...params);
  return row?.ended_at || null;
}

export async function getUserStats(userId: string, range: string, guildId: string | null = null) {
  const totalRow: any = await getUserRangeTotal(userId, range, guildId);
  const dailyRows: any[] = await getUserDailyAggregate(userId, range, guildId);
  const lastSeen = await getUserLastSeen(userId, guildId);

  const totalMinutes = totalRow?.total || 0;
  const daysCount = dailyRows.length;
  const averageMinutes = daysCount ? Math.round(totalMinutes / daysCount) : 0;
  const maxDayMinutes = dailyRows.reduce((max, row) => Math.max(max, row.total || 0), 0);

  return {
    totalMinutes,
    daysCount,
    averageMinutes,
    maxDayMinutes,
    lastSeen,
  };
}

export async function getSessionHistory(userId: string, limit = 10) {
  return _db.allAsync(
    `SELECT * FROM voice_sessions_history WHERE user_id = ? ORDER BY ended_at DESC LIMIT ?`,
    userId,
    limit
  );
}

export async function close() {
  if (!_db) return;
  await promisify(_db.close.bind(_db))();
}
