import { Interaction } from 'discord.js';

export default {
  name: 'interactionCreate',
  async execute(interaction: Interaction, { client, db }: any) {
    try {
      if (!interaction.isChatInputCommand()) return;

      const { commandName } = interaction;
      if (commandName === 'voicetime') {
        const category = interaction.options.getString('category') || 'total';
        const rows = await db.getTop(category, 20);
        if (!rows || rows.length === 0) {
          await interaction.reply('No data found for the specified category.');
          return;
        }
        const leaderboard = rows.map((row: any, idx: number) => `${idx + 1}. ${row.nickname} - ${Math.floor(row.time / 60)}h ${row.time % 60}m`);
        await interaction.reply(`Top users in the ${category} category:\n${leaderboard.join('\n')}`);
      }
    } catch (err) {
      console.error('interactionCreate error:', err);
    }
  },
};
