// Run with: npx ts-node scripts/analyze_db.ts
import * as db from '../src/db';

async function main() {
  await db.init('./voice_data.db');

  console.log('=== voice_data ===');
  const allData = await (await import('../src/db')).getTop('total', 100);
  for (const row of allData) {
    console.log(`${row.nickname}: ${row.time} min (${Math.floor(row.time/60)}h ${row.time%60}m)`);
  }

  console.log('\n=== zethbig stats (no guild filter) ===');
  const statsGlobal = await db.getUserStats('177313364999929866', 'total');
  console.log(JSON.stringify(statsGlobal, null, 2));

  console.log('\n=== zethbig stats (with guild filter) ===');
  const statsGuild = await db.getUserStats('177313364999929866', 'total', '495677065027387392');
  console.log(JSON.stringify(statsGuild, null, 2));

  console.log('\n=== zethbig session history (last 5) ===');
  const history = await db.getSessionHistory('177313364999929866', 5);
  for (const h of history) {
    console.log(`  started=${new Date(h.started_at).toISOString()} ended=${new Date(h.ended_at).toISOString()} dur=${h.duration_minutes}min guild=${h.guild_id}`);
  }
  
  // Check if guild_id is set in history
  console.log('\n=== all distinct guild_ids in history ===');
  const { default: sqlite3 } = await import('sqlite3');
  const { promisify } = require('util');
  // Can't access _db directly, let's just look at voice_data guilds
  const voiceDataGuilds = allData.map((r: any) => r.guild_id);
  console.log('voice_data guild_ids:', [...new Set(voiceDataGuilds)]);

  await db.close();
}

main().catch(console.error);