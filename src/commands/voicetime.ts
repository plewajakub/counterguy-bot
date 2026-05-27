import { SlashCommandBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('voicetime')
  .setDescription('Show voice time leaderboard')
  .addStringOption((option) =>
    option
      .setName('category')
      .setDescription('Category: total|muted|deaf|alone|active')
      .setRequired(false)
  );

export async function execute(interaction: any, { db }: any) {
  const category = interaction.options.getString('category') || 'total';
  const rows = await db.getTop(category, 20);
  if (!rows || rows.length === 0) {
    await interaction.reply('No data found for the specified category.');
    return;
  }
  const leaderboard = rows.map((row: any, idx: number) => `${idx + 1}. ${row.nickname} - ${Math.floor(row.time / 60)}h ${row.time % 60}m`);
  await interaction.reply(`Top users in the ${category} category:\n${leaderboard.join('\n')}`);
}

export default { data, execute };
