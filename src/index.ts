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
  ],
});

async function registerEvents() {
  const eventsPath = path.join(__dirname, 'events');
  const extension = path.extname(__filename);
  const files = fs.readdirSync(eventsPath).filter((f) => f.endsWith(extension));
  for (const file of files) {
    // use dynamic import compatible with ts-node-dev / compiled output
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const eventModule = require(path.join(eventsPath, file));
    const event = eventModule.default || eventModule;
    if (event.once) client.once(event.name, (...args: any[]) => event.execute(...args, { client, db }));
    else client.on(event.name, (...args: any[]) => event.execute(...args, { client, db }));
  }
}

async function start() {
  await db.init();
  await registerEvents();

  // Register slash commands if CLIENT_ID and GUILD_ID are provided
  const clientId = process.env.CLIENT_ID;
  const guildId = process.env.GUILD_ID;
  const token = process.env.DISCORD_TOKEN;
  if (clientId && guildId && token) {
    try {
      const commandsPath = path.join(__dirname, 'commands');
      const commandFiles = fs.existsSync(commandsPath) ? fs.readdirSync(commandsPath).filter((f) => f.endsWith('.ts') || f.endsWith('.js')) : [];
      const commands: any[] = [];
      for (const file of commandFiles) {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const cmdModule = require(path.join(commandsPath, file));
        const cmd = cmdModule.default || cmdModule;
        const data = cmd.data?.toJSON ? cmd.data.toJSON() : cmd.data;
        if (data) commands.push(data);
      }

      if (commands.length > 0) {
        const rest = new REST({ version: '10' }).setToken(token);
        await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: commands });
        console.log('Registered slash commands for guild', guildId);
      }
    } catch (err) {
      console.error('Failed to register slash commands:', err);
    }
  }

  if (!token) {
    console.error('Missing DISCORD_TOKEN. Set it in environment or .env file.');
    process.exit(1);
  }

  client.login(token).catch((err) => {
    console.error('Failed to login to Discord:', err);
    process.exit(1);
  });
}

start();

export { client, db };
