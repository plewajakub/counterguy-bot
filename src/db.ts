import sqlite3 from 'sqlite3';
import { promisify } from 'util';

let _db: any;

export async function init(filename = './voice_data.db') {
  _db = new sqlite3.Database(filename);
  _db.runAsync = promisify(_db.run.bind(_db));
  _db.getAsync = promisify(_db.get.bind(_db));
  _db.allAsync = promisify(_db.all.bind(_db));

  await _db.runAsync(`
    CREATE TABLE IF NOT EXISTS voice_data (
      user_id TEXT PRIMARY KEY,
      nickname TEXT,
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
      channel_id TEXT,
      last_ts INTEGER,
      is_muted INTEGER DEFAULT 0,
      is_deaf INTEGER DEFAULT 0,
      is_alone INTEGER DEFAULT 0
    )
  `);
}

export async function upsertSession(userId: string, channelId: string | null, ts: number | null, isMuted: boolean, isDeaf: boolean, isAlone: boolean) {
  await _db.runAsync(
    `INSERT OR REPLACE INTO voice_sessions (user_id, channel_id, last_ts, is_muted, is_deaf, is_alone)
     VALUES (?, ?, ?, ?, ?, ?)`,
    userId,
    channelId || null,
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

export async function addMinutesToUser(userId: string, nickname: string, minutes: number, isMuted: boolean, isDeaf: boolean, isAlone: boolean) {
  if (minutes <= 0) return;
  const totalInc = minutes;
  const mutedInc = isMuted ? minutes : 0;
  const deafInc = isDeaf ? minutes : 0;
  const aloneInc = isAlone ? minutes : 0;
  const activeInc = !isMuted && !isDeaf && !isAlone ? minutes : 0;

  await _db.runAsync(
    `INSERT INTO voice_data (user_id, nickname, total_time, muted_time, deafened_time, alone_time, active_time)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET
       nickname = excluded.nickname,
       total_time = voice_data.total_time + excluded.total_time,
       muted_time = voice_data.muted_time + excluded.muted_time,
       deafened_time = voice_data.deafened_time + excluded.deafened_time,
       alone_time = voice_data.alone_time + excluded.alone_time,
       active_time = voice_data.active_time + excluded.active_time`,
    userId,
    nickname,
    totalInc,
    mutedInc,
    deafInc,
    aloneInc,
    activeInc
  );
}

export async function endSessionAndAdd(userId: string, nickname: string) {
  const session = await getSession(userId);
  if (!session || !session.last_ts) return;
  const now = Date.now();
  const deltaMs = now - session.last_ts;
  const minutes = Math.floor(deltaMs / 60000);
  if (minutes > 0) {
    await addMinutesToUser(userId, nickname, minutes, !!session.is_muted, !!session.is_deaf, !!session.is_alone);
  }
  await clearSession(userId);
}

export async function updateSessionState(userId: string, nickname: string, isMuted: boolean, isDeaf: boolean, isAlone: boolean) {
  const session = await getSession(userId);
  const now = Date.now();
  if (session && session.last_ts) {
    const deltaMs = now - session.last_ts;
    const minutes = Math.floor(deltaMs / 60000);
    if (minutes > 0) {
      await addMinutesToUser(userId, nickname, minutes, !!session.is_muted, !!session.is_deaf, !!session.is_alone);
    }
  }
  await upsertSession(userId, session ? session.channel_id : null, now, isMuted, isDeaf, isAlone);
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

export async function close() {
  if (!_db) return;
  await promisify(_db.close.bind(_db))();
}
