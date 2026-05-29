import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  SlashCommandBuilder,
  User,
} from 'discord.js';
import { convertMinutesToHours, capitalizeFirstLetter } from '../utils';

const CATEGORY_LABELS: Record<string, string> = {
  total: 'Total voice time',
  muted: 'Muted time',
  deaf: 'Deafened time',
  alone: 'Alone time',
  active: 'Active time',
};

const RANGE_LABELS: Record<string, string> = {
  total: 'Total',
  today: 'Today',
  week: 'Last 7 days',
  month: 'Last 30 days',
  year: 'Last year',
};

const CATEGORY_CHOICES = [
  { name: 'total', value: 'total' },
  { name: 'muted', value: 'muted' },
  { name: 'deaf', value: 'deaf' },
  { name: 'alone', value: 'alone' },
  { name: 'active', value: 'active' },
];

const RANGE_CHOICES = [
  { name: 'total', value: 'total' },
  { name: 'today', value: 'today' },
  { name: 'week', value: 'week' },
  { name: 'month', value: 'month' },
  { name: 'year', value: 'year' },
];

export const data = new SlashCommandBuilder()
  .setName('voicetime')
  .setDescription('Voice time stats and leaderboards')
  .addSubcommand((subcommand) =>
    subcommand
      .setName('leaderboard')
      .setDescription('Show the voice time leaderboard for a category')
      .addStringOption((option) =>
        option
          .setName('category')
          .setDescription('Choose a category')
          .setRequired(false)
          .addChoices(...CATEGORY_CHOICES)
      )
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName('user')
      .setDescription('Show voice stats for a specific user')
      .addUserOption((option) =>
        option.setName('target').setDescription('User to inspect').setRequired(true)
      )
      .addStringOption((option) =>
        option
          .setName('range')
          .setDescription('Time range to display')
          .setRequired(false)
          .addChoices(...RANGE_CHOICES)
      )
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName('compare')
      .setDescription('Compare voice stats between two users')
      .addUserOption((option) =>
        option.setName('user1').setDescription('First user').setRequired(true)
      )
      .addUserOption((option) =>
        option.setName('user2').setDescription('Second user').setRequired(true)
      )
      .addStringOption((option) =>
        option
          .setName('range')
          .setDescription('Time range to display')
          .setRequired(false)
          .addChoices(...RANGE_CHOICES)
      )
  )
  .addSubcommand((subcommand) =>
    subcommand.setName('games').setDescription('Show the most played games while on voice')
  );

function buildRangeButtons(authorId: string, targetUserId: string, selectedRange: string) {
  const row = new ActionRowBuilder<ButtonBuilder>();
  const buttonIds = ['today', 'week', 'month', 'year', 'total'];

  for (const range of buttonIds) {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`voicetime_user:${authorId}:${targetUserId}:${range}`)
        .setLabel(RANGE_LABELS[range])
        .setStyle(range === selectedRange ? ButtonStyle.Primary : ButtonStyle.Secondary)
    );
  }

  return row;
}

function createUserEmbed(
  target: User,
  range: string,
  stats: any,
  breakdown: any,
  streak: any = null
) {
  const username = target.tag || `${target.username}#${target.discriminator}`;
  const lastSeen = stats.lastSeen ? new Date(stats.lastSeen).toLocaleString('pl-PL') : 'Never';

  const fields: any[] = [
    { name: 'Total time', value: convertMinutesToHours(stats.totalMinutes), inline: true },
    { name: 'Total active', value: convertMinutesToHours(breakdown.active_time), inline: true },
    { name: 'Total muted', value: convertMinutesToHours(breakdown.muted_time), inline: true },
    { name: 'Total deafened', value: convertMinutesToHours(breakdown.deafened_time), inline: true },
    { name: 'Total alone', value: convertMinutesToHours(breakdown.alone_time), inline: true },
    { name: '\u200B', value: '\u200B', inline: true },
    { name: 'Average per day', value: convertMinutesToHours(stats.averageMinutes), inline: true },
    { name: 'Best single day', value: convertMinutesToHours(stats.maxDayMinutes), inline: true },
    { name: 'Last seen', value: lastSeen, inline: true },
  ];

  // Add streak info if available
  if (streak) {
    fields.push({
      name: '🔥 Current streak',
      value: `${streak.current_streak || 0} day${streak.current_streak !== 1 ? 's' : ''}`,
      inline: true,
    });
    fields.push({
      name: '🏆 Longest streak',
      value: `${streak.longest_streak || 0} day${streak.longest_streak !== 1 ? 's' : ''}`,
      inline: true,
    });
    fields.push({ name: '\u200B', value: '\u200B', inline: true });
  }

  const embed = new EmbedBuilder()
    .setThumbnail(target.displayAvatarURL({ size: 256 }))
    .setTitle(`Voice stats for ${username}`)
    .setDescription(`Range: **${RANGE_LABELS[range] || RANGE_LABELS.total}**`)
    .addFields(fields)
    .setColor(0x5dade2)
    .setFooter({ text: 'Use the buttons below to switch range' });

  return embed;
}

export async function execute(interaction: any, { db }: any) {
  const subcommand = interaction.options.getSubcommand();
  const guildId = interaction.guildId || null;

  if (subcommand === 'leaderboard') {
    const category = (interaction.options.getString('category') || 'total').toLowerCase();
    const rows = await db.getTop(category, 10, guildId);
    if (!rows || rows.length === 0) {
      await interaction.reply({
        content: 'No data found for the specified category.',
        ephemeral: true,
      });
      return;
    }

    const title = CATEGORY_LABELS[category] || CATEGORY_LABELS.total;
    const leaderboard = rows
      .map(
        (row: any, idx: number) =>
          `**${idx + 1}.** ${row.nickname} — ${convertMinutesToHours(row.time)}`
      )
      .join('\n');

    const embed = new EmbedBuilder()
      .setTitle(`Voice leaderboard · ${title}`)
      .setDescription(leaderboard)
      .setColor(0x5dade2)
      .setFooter({ text: 'Use /voicetime user @user to see detailed stats' });

    await interaction.reply({ embeds: [embed] });
    return;
  }

  if (subcommand === 'user') {
    const target = interaction.options.getUser('target');
    const range = (interaction.options.getString('range') || 'total').toLowerCase();
    const stats = await db.getUserStats(target.id, range, guildId);
    const breakdown = await db.getUserCategoryBreakdown(target.id, range, guildId);
    const streak = guildId ? await db.getUserStreaks(target.id, guildId) : null;

    if (!stats || (stats.totalMinutes === 0 && stats.daysCount === 0 && !stats.lastSeen)) {
      await interaction.reply({
        content: `No voice stats found for ${target.username}.`,
        ephemeral: true,
      });
      return;
    }

    const embed = createUserEmbed(target, range, stats, breakdown, streak);
    const buttons = buildRangeButtons(interaction.user.id, target.id, range);

    await interaction.reply({ embeds: [embed], components: [buttons] });
    return;
  }

  if (subcommand === 'compare') {
    const user1 = interaction.options.getUser('user1');
    const user2 = interaction.options.getUser('user2');
    const range = (interaction.options.getString('range') || 'total').toLowerCase();

    const [stats1, stats2, breakdown1, breakdown2] = await Promise.all([
      db.getUserStats(user1.id, range, guildId),
      db.getUserStats(user2.id, range, guildId),
      db.getUserCategoryBreakdown(user1.id, range, guildId),
      db.getUserCategoryBreakdown(user2.id, range, guildId),
    ]);

    const name1 = user1.tag || `${user1.username}#${user1.discriminator}`;
    const name2 = user2.tag || `${user2.username}#${user2.discriminator}`;
    const t1 = stats1?.totalMinutes || 0;
    const t2 = stats2?.totalMinutes || 0;

    const embed = new EmbedBuilder()
      .setTitle(`⚔️ Voice time comparison`)
      .setDescription(`Range: **${RANGE_LABELS[range] || RANGE_LABELS.total}**`)
      .setColor(0x5dade2)
      .addFields(
        {
          name: `📊 ${name1}`,
          value:
            `Total: **${convertMinutesToHours(t1)}**\n` +
            `Active: **${convertMinutesToHours(breakdown1?.active_time || 0)}**\n` +
            `Muted: **${convertMinutesToHours(breakdown1?.muted_time || 0)}**\n` +
            `Alone: **${convertMinutesToHours(breakdown1?.alone_time || 0)}**`,
          inline: true,
        },
        {
          name: `📊 ${name2}`,
          value:
            `Total: **${convertMinutesToHours(t2)}**\n` +
            `Active: **${convertMinutesToHours(breakdown2?.active_time || 0)}**\n` +
            `Muted: **${convertMinutesToHours(breakdown2?.muted_time || 0)}**\n` +
            `Alone: **${convertMinutesToHours(breakdown2?.alone_time || 0)}**`,
          inline: true,
        },
        {
          name: '\u200B',
          value: '\u200B',
          inline: false,
        },
        {
          name: '🏆 Result',
          value:
            t1 > t2
              ? `${name1} is leading by **${convertMinutesToHours(t1 - t2)}**!`
              : t2 > t1
                ? `${name2} is leading by **${convertMinutesToHours(t2 - t1)}**!`
                : `It's a tie! Both have **${convertMinutesToHours(t1)}**`,
          inline: false,
        }
      );

    await interaction.reply({ embeds: [embed] });
    return;
  }

  if (subcommand === 'games') {
    if (!guildId) {
      await interaction.reply({
        content: 'This command can only be used in a server.',
        ephemeral: true,
      });
      return;
    }

    const topGames = await db.getTopGames(guildId, 10);
    if (!topGames || topGames.length === 0) {
      await interaction.reply({
        content:
          'No game data recorded yet. Games are tracked when users play them while on voice channels.',
        ephemeral: true,
      });
      return;
    }

    const gameList = topGames
      .map(
        (row: any, idx: number) =>
          `**${idx + 1}.** ${row.game_name} — ${convertMinutesToHours(row.total_minutes)} (${row.player_count} player${row.player_count !== 1 ? 's' : ''})`
      )
      .join('\n');

    const embed = new EmbedBuilder()
      .setTitle('🎮 Most played games on voice')
      .setDescription(gameList)
      .setColor(0x5dade2)
      .setFooter({ text: 'Games are tracked while users are on voice channels' });

    await interaction.reply({ embeds: [embed] });
    return;
  }

  await interaction.reply({ content: 'Unknown voicetime option.', ephemeral: true });
}

export async function handleButtonInteraction(interaction: any, { db }: any) {
  const parts = interaction.customId?.split(':') || [];
  const prefix = parts[0];
  const authorId = parts[1];
  const targetUserId = parts[2];
  const range = parts[3];
  if (prefix !== 'voicetime_user' || !authorId || !targetUserId || !range) return;

  // Only the original command author can use the buttons
  if (interaction.user.id !== authorId) {
    await interaction.reply({
      content: "You cannot interact with this message's buttons.",
      ephemeral: true,
    });
    return;
  }

  const guildId = interaction.guildId || null;
  const target = interaction.client.users.cache.get(targetUserId) || {
    id: targetUserId,
    username: 'User',
    discriminator: '????',
    tag: `<@${targetUserId}>`,
  };
  const [stats, breakdown, streak] = await Promise.all([
    db.getUserStats(targetUserId, range, guildId),
    db.getUserCategoryBreakdown(targetUserId, range, guildId),
    guildId ? db.getUserStreaks(targetUserId, guildId) : Promise.resolve(null),
  ]);
  const embed = createUserEmbed(target as User, range, stats, breakdown, streak);
  const buttons = buildRangeButtons(authorId, targetUserId, range);

  await interaction.update({ embeds: [embed], components: [buttons] });
}

export default { data, execute, handleButtonInteraction };
