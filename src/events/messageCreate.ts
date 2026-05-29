import { convertMinutesToHours, capitalizeFirstLetter } from '../utils';

export default {
  name: 'messageCreate',
  async execute(message: any, { client, db }: any) {
    try {
      if (message.author.bot) return;
      if (!message.guild) return;
      if (!message.content.startsWith('/voicetime')) return;

      const args = message.content.split(' ');
      const command = args.shift().toLowerCase();
      const category = args.shift();

      if (
        command !== '/voicetime' ||
        !['total', 'muted', 'deaf', 'alone', 'active'].includes(category)
      )
        return;

      const guildId = message.guild.id;
      const rows = await db.getTop(category, 10, guildId);
      if (!rows || rows.length === 0) {
        return message.reply('No data found for the specified category.');
      }

      const leaderboard = rows.map(
        (row: any, index: number) =>
          `${index + 1}. ${row.nickname} - ${convertMinutesToHours(row.time)}`
      );
      message.reply(
        `Top users in the ${capitalizeFirstLetter(category)} category:\n${leaderboard.join('\n')}`
      );
    } catch (err) {
      console.error('Error handling messageCreate:', err);
    }
  },
};
