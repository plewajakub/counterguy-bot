import fs from 'fs';
import sqlite3 from 'sqlite3';
import { promisify } from 'util';

let _db: any;

async function migrateVoiceData() {
  const tableInfo: any[] = await _db.allAsync(`PRAGMA table_info(voice_data)`);
  const pkColumns = tableInfo.filter((col: any) => col.pk > 0);
  const isOldSchema = pkColumns.length === 1 && pkColumns[0].name === 'user_id';

  if (!isOldSchema) return;

  console.log('Migrating voice_data schema from old format...');

  await _db.runAsync(`UPDATE voice_data SET guild_id = '__global__' WHERE guild_id IS NULL`);

  await _db.runAsync(`
    CREATE TABLE voice_data_new (
      user_id TEXT NOT NULL,
      nickname TEXT,
      guild_id TEXT NOT NULL DEFAULT '__global__',
      total_time INTEGER DEFAULT 0,
      muted_time INTEGER DEFAULT 0,
      deafened_time INTEGER DEFAULT 0,
      alone_time INTEGER DEFAULT 0,
      active_time INTEGER DEFAULT 0,
      PRIMARY KEY (user_id, guild_id)
    )
  `);

  await _db.runAsync(`
    INSERT INTO voice_data_new (user_id, nickname, guild_id, total_time, muted_time, deafened_time, alone_time, active_time)
    SELECT user_id, nickname, guild_id, total_time, muted_time, deafened_time, alone_time, active_time
    FROM voice_data
  `);

  await _db.runAsync(`DROP TABLE voice_data`);
  await _db.runAsync(`ALTER TABLE voice_data_new RENAME TO voice_data`);
  console.log('Migration complete.');
}

async function ensureColumn(table: string, column: string, def: string) {
  const columns: any[] = await _db.allAsync(`PRAGMA table_info(${table})`);
  const hasColumn = columns.some((c: any) => c.name === column);
  if (!hasColumn) {
    await _db.runAsync(`ALTER TABLE ${table} ADD COLUMN ${column} ${def}`);
  }
}

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
      user_id TEXT NOT NULL,
      nickname TEXT,
      guild_id TEXT NOT NULL,
      total_time INTEGER DEFAULT 0,
      muted_time INTEGER DEFAULT 0,
      deafened_time INTEGER DEFAULT 0,
      alone_time INTEGER DEFAULT 0,
      active_time INTEGER DEFAULT 0,
      PRIMARY KEY (user_id, guild_id)
    )
  `);

  await migrateVoiceData();

  await _db.runAsync(`
    CREATE TABLE IF NOT EXISTS voice_sessions (
      user_id TEXT PRIMARY KEY,
      guild_id TEXT,
      channel_id TEXT,
      started_at INTEGER,
      last_updated_at INTEGER,
      is_muted INTEGER DEFAULT 0,
      is_deaf INTEGER DEFAULT 0,
      is_alone INTEGER DEFAULT 0,
      game_name TEXT
    )
  `);

  await ensureColumn('voice_sessions', 'game_name', 'TEXT');

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
      is_alone INTEGER DEFAULT 0,
      game_name TEXT
    )
  `);

  await ensureColumn('voice_sessions_history', 'game_name', 'TEXT');

  await _db.runAsync(`
    CREATE TABLE IF NOT EXISTS user_games (
      user_id TEXT NOT NULL,
      guild_id TEXT NOT NULL,
      game_name TEXT NOT NULL,
      total_minutes INTEGER DEFAULT 0,
      PRIMARY KEY (user_id, guild_id, game_name)
    )
  `);

  await _db.runAsync(`
    CREATE TABLE IF NOT EXISTS voice_streaks (
      user_id TEXT NOT NULL,
      guild_id TEXT NOT NULL,
      current_streak INTEGER DEFAULT 0,
      longest_streak INTEGER DEFAULT 0,
      last_active_date TEXT,
      PRIMARY KEY (user_id, guild_id)
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

  const resolvedGuildId = guildId || '__global__';

  await _db.runAsync(
    `INSERT INTO voice_data (user_id, nickname, guild_id, total_time, muted_time, deafened_time, alone_time, active_time)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id, guild_id) DO UPDATE SET
       nickname = excluded.nickname,
       total_time = voice_data.total_time + excluded.total_time,
       muted_time = voice_data.muted_time + excluded.muted_time,
       deafened_time = voice_data.deafened_time + excluded.deafened_time,
       alone_time = voice_data.alone_time + excluded.alone_time,
       active_time = voice_data.active_time + excluded.active_time`,
    userId,
    nickname,
    resolvedGuildId,
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
  isAlone: boolean,
  gameName: string | null = null
) {
  await _db.runAsync(
    `INSERT INTO voice_sessions_history (user_id, guild_id, channel_id, started_at, ended_at, duration_minutes, is_muted, is_deaf, is_alone, game_name)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    userId,
    guildId || null,
    channelId || null,
    startedAt,
    endedAt,
    durationMinutes,
    isMuted ? 1 : 0,
    isDeaf ? 1 : 0,
    isAlone ? 1 : 0,
    gameName || null
  );
}

async function updateStreak(userId: string, guildId: string | null) {
  if (!guildId) return;
  const today = new Date().toISOString().split('T')[0];

  const row = await _db.getAsync(
    `SELECT current_streak, longest_streak, last_active_date FROM voice_streaks WHERE user_id = ? AND guild_id = ?`,
    userId,
    guildId
  );

  if (!row) {
    await _db.runAsync(
      `INSERT INTO voice_streaks (user_id, guild_id, current_streak, longest_streak, last_active_date) VALUES (?, ?, 1, 1, ?)`,
      userId,
      guildId,
      today
    );
    return;
  }

  if (row.last_active_date === today) {
    return;
  }

  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
  const isConsecutive = row.last_active_date === yesterday;

  const newCurrent = isConsecutive ? (row.current_streak || 0) + 1 : 1;
  const newLongest = Math.max(newCurrent, row.longest_streak || 0);

  await _db.runAsync(
    `UPDATE voice_streaks SET current_streak = ?, longest_streak = ?, last_active_date = ? WHERE user_id = ? AND guild_id = ?`,
    newCurrent,
    newLongest,
    today,
    userId,
    guildId
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

  if (session.game_name && minutes > 0 && session.guild_id) {
    await _db.runAsync(
      `INSERT INTO user_games (user_id, guild_id, game_name, total_minutes)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(user_id, guild_id, game_name) DO UPDATE SET
         total_minutes = user_games.total_minutes + excluded.total_minutes`,
      userId,
      session.guild_id,
      session.game_name,
      minutes
    );
  }

  await archiveSessionRecord(
    userId,
    session.guild_id,
    session.channel_id,
    session.started_at,
    now,
    durationMinutes,
    !!session.is_muted,
    !!session.is_deaf,
    !!session.is_alone,
    session.game_name
  );

  if (durationMinutes > 0 && session.guild_id) {
    await updateStreak(userId, session.guild_id);
  }

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

      if (session.game_name && session.guild_id) {
        await _db.runAsync(
          `INSERT INTO user_games (user_id, guild_id, game_name, total_minutes)
           VALUES (?, ?, ?, ?)
           ON CONFLICT(user_id, guild_id, game_name) DO UPDATE SET
             total_minutes = user_games.total_minutes + excluded.total_minutes`,
          userId,
          session.guild_id,
          session.game_name,
          minutes
        );
      }
    }
  }

  await _db.runAsync(
    `INSERT OR REPLACE INTO voice_sessions (user_id, guild_id, channel_id, started_at, last_updated_at, is_muted, is_deaf, is_alone, game_name)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    userId,
    session ? session.guild_id : null,
    session ? session.channel_id : null,
    session ? session.started_at : now,
    now,
    isMuted ? 1 : 0,
    isDeaf ? 1 : 0,
    isAlone ? 1 : 0,
    session ? session.game_name : null
  );
}

export async function updateSessionGame(userId: string, gameName: string | null) {
  const session = await getSession(userId);
  if (!session) return;

  const now = Date.now();
  if ((session.game_name || gameName) && session.last_updated_at && session.guild_id) {
    const deltaMs = now - session.last_updated_at;
    const minutes = Math.floor(deltaMs / 60000);
    if (minutes > 0) {
      const trackGame = session.game_name || gameName;
      if (trackGame) {
        await _db.runAsync(
          `INSERT INTO user_games (user_id, guild_id, game_name, total_minutes)
           VALUES (?, ?, ?, ?)
           ON CONFLICT(user_id, guild_id, game_name) DO UPDATE SET
             total_minutes = user_games.total_minutes + excluded.total_minutes`,
          userId,
          session.guild_id,
          trackGame,
          minutes
        );
      }
    }
  }

  await _db.runAsync(
    `UPDATE voice_sessions SET game_name = ?, last_updated_at = ? WHERE user_id = ?`,
    gameName || null,
    now,
    userId
  );
}

export async function getTop(category: string, limit = 20, guildId: string | null = null) {
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

  const params: any[] = [limit];
  let whereClause = `WHERE ${col} > 0`;
  if (guildId) {
    whereClause += ' AND (guild_id = ? OR guild_id = ?)';
    params.unshift(guildId, '__global__');
  }

  return _db.allAsync(
    `SELECT user_id, nickname, ${col} as time FROM voice_data ${whereClause} ORDER BY ${col} DESC LIMIT ?`,
    params
  );
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

export async function getUserRangeTotal(
  userId: string,
  range: string,
  guildId: string | null = null
) {
  // Try history first
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

  const historyRow: any = await _db.getAsync(query, ...params);

  // Also get from voice_data for backward compatibility (old data that wasn't in history)
  // For "total" range, add voice_data total
  if (range === 'total' || range === 'all') {
    const vdParams: any[] = [userId];
    let vdQuery = `SELECT COALESCE(SUM(total_time), 0) AS total FROM voice_data WHERE user_id = ?`;
    if (guildId) {
      // Include both guild-specific records AND legacy __global__ records
      vdQuery += ' AND (guild_id = ? OR guild_id = ?)';
      vdParams.push(guildId, '__global__');
    } else {
      vdQuery += ' AND guild_id = ?';
      vdParams.push('__global__');
    }
    const vdRow: any = await _db.getAsync(vdQuery, ...vdParams);
    const vdTotal = vdRow?.total || 0;

    // Return the larger of history vs voice_data total
    return { total: Math.max(historyRow?.total || 0, vdTotal) };
  }

  return historyRow;
}

export async function getUserDailyAggregate(
  userId: string,
  range: string,
  guildId: string | null = null
) {
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
  // Also check voice_data for lastSeen fallback (for old data without history)
  if (!lastSeen) {
    const vd = await _db.getAsync(`SELECT total_time FROM voice_data WHERE user_id = ? AND (guild_id = ? OR guild_id = '__global__')`, userId, guildId || '__global__');
    if (vd && vd.total_time > 0) {
      // Use current timestamp as approximate last seen for legacy data
    }
  }

  // For daily aggregate, fall back to a single "Legacy" day if history is empty but voice_data has data
  let daysCount = dailyRows.length;
  let averageMinutes = daysCount ? Math.round((totalRow?.total || 0) / daysCount) : 0;
  let maxDayMinutes = dailyRows.reduce((max, row) => Math.max(max, row.total || 0), 0);

  // If no history data but voice_data has data, show it as legacy
  if (daysCount === 0 && (totalRow?.total || 0) > 0) {
    daysCount = 1;
    averageMinutes = totalRow?.total || 0;
    maxDayMinutes = totalRow?.total || 0;
  }

  return {
    totalMinutes: totalRow?.total || 0,
    daysCount,
    averageMinutes,
    maxDayMinutes,
    lastSeen,
  };
}

export async function getUserCategoryBreakdown(
  userId: string,
  range: string,
  guildId: string | null = null
) {
  const params: any[] = [userId];
  let query = `
    SELECT 
      COALESCE(SUM(CASE WHEN is_muted = 1 THEN duration_minutes ELSE 0 END), 0) AS muted_time,
      COALESCE(SUM(CASE WHEN is_deaf = 1 THEN duration_minutes ELSE 0 END), 0) AS deafened_time,
      COALESCE(SUM(CASE WHEN is_alone = 1 THEN duration_minutes ELSE 0 END), 0) AS alone_time,
      COALESCE(SUM(CASE WHEN is_muted = 0 AND is_deaf = 0 AND is_alone = 0 THEN duration_minutes ELSE 0 END), 0) AS active_time,
      COALESCE(SUM(duration_minutes), 0) AS total_time
    FROM voice_sessions_history WHERE user_id = ?
  `;

  if (range !== 'total') {
    const start = getRangeStartTimestamp(range);
    query += ' AND ended_at BETWEEN ? AND ?';
    params.push(start, Date.now());
  }

  if (guildId) {
    query += ' AND guild_id = ?';
    params.push(guildId);
  }

  const breakdown: any = await _db.getAsync(query, ...params);

  // If history is empty but voice_data has data, show total from voice_data as "active"
  if ((breakdown?.total_time || 0) === 0) {
    const vdParams: any[] = [userId];
    let vdQuery = `SELECT total_time, active_time, muted_time, deafened_time, alone_time FROM voice_data WHERE user_id = ?`;
    if (guildId) {
      vdQuery += ' AND (guild_id = ? OR guild_id = ?)';
      vdParams.push(guildId, '__global__');
    } else {
      vdQuery += ' AND guild_id = ?';
      vdParams.push('__global__');
    }
    const vd: any = await _db.getAsync(vdQuery, ...vdParams);
    if (vd) {
      return {
        muted_time: vd.muted_time || 0,
        deafened_time: vd.deafened_time || 0,
        alone_time: vd.alone_time || 0,
        active_time: vd.active_time || 0,
        total_time: vd.total_time || 0,
      };
    }
  }

  return breakdown || { muted_time: 0, deafened_time: 0, alone_time: 0, active_time: 0, total_time: 0 };
}

export async function getTopGames(guildId: string, limit = 10) {
  return _db.allAsync(
    `SELECT ug.game_name, SUM(ug.total_minutes) as total_minutes,
            COUNT(DISTINCT ug.user_id) as player_count
     FROM user_games ug
     WHERE ug.guild_id = ?
     GROUP BY ug.game_name
     ORDER BY total_minutes DESC
     LIMIT ?`,
    guildId,
    limit
  );
}

export async function getUserGameStats(userId: string, guildId: string) {
  return _db.allAsync(
    `SELECT game_name, total_minutes FROM user_games WHERE user_id = ? AND guild_id = ? ORDER BY total_minutes DESC`,
    userId,
    guildId
  );
}

export async function getUserStreaks(userId: string, guildId: string) {
  return _db.getAsync(
    `SELECT current_streak, longest_streak, last_active_date FROM voice_streaks WHERE user_id = ? AND guild_id = ?`,
    userId,
    guildId
  );
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