import 'dotenv/config';
import path from 'path';
import fs from 'fs';
import { Client, GatewayIntentBits } from 'discord.js';
import * as db from './db';
import { REST } from 'discord.js';
import { Routes } from 'discord.js';

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildPresences,
  ],
});

async function registerEvents() {
  const eventsPath = path.join(__dirname, 'events');
  const extension = path.extname(__filename);
  const files = fs.readdirSync(eventsPath).filter((f) => f.endsWith(extension));
  for (const file of files) {
    const eventModule = require(path.join(eventsPath, file));
    const event = eventModule.default || eventModule;
    if (event.once)
      client.once(event.name, (...args: any[]) => event.execute(...args, { client, db }));
    else client.on(event.name, (...args: any[]) => event.execute(...args, { client, db }));
  }
}

async function registerSlashCommands() {
  const clientId = process.env.CLIENT_ID;
  const guildId = process.env.GUILD_ID;
  const token = process.env.DISCORD_TOKEN;
  if (!clientId || !guildId || !token) return;

  try {
    const commandsPath = path.join(__dirname, 'commands');
    const commandFiles = fs.existsSync(commandsPath)
      ? fs.readdirSync(commandsPath).filter((f) => f.endsWith('.ts') || f.endsWith('.js'))
      : [];
    const commands: any[] = [];
    for (const file of commandFiles) {
      const cmdModule = require(path.join(commandsPath, file));
      const cmd = cmdModule.default || cmdModule;
      const data = cmd.data?.toJSON ? cmd.data.toJSON() : cmd.data;
      if (data) commands.push(data);
    }

    if (commands.length > 0) {
      const rest = new REST({ version: '10' }).setToken(token);
      await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: commands });
      console.log(`Registered ${commands.length} slash commands for guild ${guildId}`);
    }
  } catch (err) {
    console.error('Failed to register slash commands:', err);
  }
}

// Handle client-level errors gracefully instead of crashing
client.on('error', (err) => {
  console.error('Client error (non-fatal):', err.message);
});

client.on('shardError', (err) => {
  console.error('Shard error (non-fatal):', err.message);
});

// Handle disconnects gracefully
client.on('shardDisconnect', (event, shardId) => {
  console.log(`Shard ${shardId} disconnected, code=${event.code}. Will auto-reconnect.`);
});

async function start() {
  const dbFile = process.env.DB_FILE || './voice_data.db';
  const backupOnStart =
    (process.env.DB_BACKUP_ON_START || '').toLowerCase() === '1' ||
    (process.env.DB_BACKUP_ON_START || '').toLowerCase() === 'true';
  await db.init(dbFile, { backupOnStart });
  await registerEvents();

  const token = process.env.DISCORD_TOKEN;
  if (!token) {
    console.error('Missing DISCORD_TOKEN. Set it in environment or .env file.');
    setTimeout(start, 60000);
    return;
  }

  // Register slash commands before login (works with just the token via REST)
  await registerSlashCommands().catch(() => {});

  // Login once — no retry loop.
  // If login succeeds but disconnects, discord.js auto-reconnects on its own.
  // If login fails (wrong token, rate limit), we log and wait, then retry ONCE.
  try {
    await client.login(token);
    console.log('Logged in as ' + client.user?.tag);
  } catch (err: any) {
    console.error('Login failed:', err.message);
    // Only retry on rate-limit once
    if (err.message?.includes('Not enough sessions') || err.message?.includes('sessions remaining')) {
      const match = err.message.match(/resets at (\S+)/);
      if (match) {
        const resetTime = new Date(match[1]).getTime();
        const waitMs = Math.max(resetTime - Date.now() + 1000, 60000);
        console.log(`Rate limited. Waiting ${Math.round(waitMs/60000)} min before one retry...`);
        setTimeout(async () => {
          try {
            await client.login(token);
            console.log('Logged in after rate-limit wait');
          } catch (e2: any) {
            console.error('Login still failing after wait:', e2.message);
            console.log('Will stay alive but not connected. Fix intents or token.');
          }
        }, waitMs);
      }
    } else {
      // Non-rate-limit error (wrong token, etc) — stay alive, don't spam login
      console.log('Login failed. Will stay alive but not connected. Check your token and intents in Discord Developer Portal.');
    }
  }
}

start();

export { client, db };