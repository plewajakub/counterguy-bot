const { convertMinutesToHours, capitalizeFirstLetter } = require('../utils');

module.exports = {
  name: 'messageCreate',
  async execute(message, { client, db }) {
    if (!message.content.startsWith('/voicetime')) return;

    const args = message.content.split(' ');
    const command = args.shift().toLowerCase();
    const category = args.shift();

    if (command !== '/voicetime' || !['total', 'muted', 'deaf', 'alone', 'active'].includes(category)) return;

    const rows = await db.getTop(category, 20);
    if (!rows || rows.length === 0) {
      return message.reply('No data found for the specified category.');
    }

    const leaderboard = rows.map((row, index) => `${index + 1}. ${row.nickname} - ${convertMinutesToHours(row.time)}`);
    message.reply(`Top users in the ${capitalizeFirstLetter(category)} category:\n${leaderboard.join('\n')}`);
  },
};
