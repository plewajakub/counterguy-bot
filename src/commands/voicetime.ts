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
      .addUserOption((option) => option.setName('target').setDescription('User to inspect').setRequired(true))
      .addStringOption((option) =>
        option
          .setName('range')
          .setDescription('Time range to display')
          .setRequired(false)
          .addChoices(...RANGE_CHOICES)
      )
  );

function buildRangeButtons(targetUserId: string, selectedRange: string) {
  const row = new ActionRowBuilder<ButtonBuilder>();
  const buttonIds = ['today', 'week', 'month', 'year', 'total'];

  for (const range of buttonIds) {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`voicetime_user:${targetUserId}:${range}`)
        .setLabel(RANGE_LABELS[range])
        .setStyle(range === selectedRange ? ButtonStyle.Primary : ButtonStyle.Secondary)
    );
  }

  return row;
}

function createUserEmbed(target: User, range: string, stats: any) {
  const username = target.tag || `${target.username}#${target.discriminator}`;
  const lastSeen = stats.lastSeen ? new Date(stats.lastSeen).toLocaleString('pl-PL') : 'Never';

  const embed = new EmbedBuilder()
    .setThumbnail(target.displayAvatarURL({ size: 256 }))
    .setTitle(`Voice stats for ${username}`)
    .setDescription(`Range: **${RANGE_LABELS[range] || RANGE_LABELS.total}**`)
    .addFields(
      { name: 'Total time', value: convertMinutesToHours(stats.totalMinutes), inline: true },
      { name: 'Average per day', value: convertMinutesToHours(stats.averageMinutes), inline: true },
      { name: 'Best single day', value: convertMinutesToHours(stats.maxDayMinutes), inline: true },
      { name: 'Last seen', value: lastSeen, inline: false }
    )
    .setColor(0x5dade2)
    .setFooter({ text: 'Use the buttons below to switch range' });

  return embed;
}

export async function execute(interaction: any, { db }: any) {
  const subcommand = interaction.options.getSubcommand();
  const guildId = interaction.guildId || null;

  if (subcommand === 'leaderboard') {
    const category = (interaction.options.getString('category') || 'total').toLowerCase();
    const rows = await db.getTop(category, 20);
    if (!rows || rows.length === 0) {
      await interaction.reply({ content: 'No data found for the specified category.', ephemeral: true });
      return;
    }

    const title = CATEGORY_LABELS[category] || CATEGORY_LABELS.total;
    const leaderboard = rows
      .slice(0, 10)
      .map((row: any, idx: number) => `**${idx + 1}.** ${row.nickname} — ${convertMinutesToHours(row.time)}`)
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

    if (!stats || (stats.totalMinutes === 0 && stats.daysCount === 0 && !stats.lastSeen)) {
      await interaction.reply({ content: `No voice stats found for ${target.username}.`, ephemeral: true });
      return;
    }

    const embed = createUserEmbed(target, range, stats);
    const buttons = buildRangeButtons(target.id, range);

    await interaction.reply({ embeds: [embed], components: [buttons] });
    return;
  }

  await interaction.reply({ content: 'Unknown voicetime option.', ephemeral: true });
}

export async function handleButtonInteraction(interaction: any, { db }: any) {
  const [prefix, targetUserId, range] = interaction.customId?.split(':') || [];
  if (prefix !== 'voicetime_user' || !targetUserId || !range) return;

  const guildId = interaction.guildId || null;
  const target = interaction.client.users.cache.get(targetUserId) || { id: targetUserId, username: `User`, discriminator: '????', tag: `<@${targetUserId}>` };
  const stats = await db.getUserStats(targetUserId, range, guildId);
  const embed = createUserEmbed(target as User, range, stats);
  const buttons = buildRangeButtons(targetUserId, range);

  await interaction.update({ embeds: [embed], components: [buttons] });
}

export default { data, execute, handleButtonInteraction };
