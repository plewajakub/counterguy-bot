async function updateChannelMembers(channel: any, excludeUserId: string, db: any) {
  if (!channel || !channel.members) return;
  const isAlone = channel.members.size === 1;
  for (const [memberId, member] of channel.members.entries()) {
    if (memberId === excludeUserId) continue;

    const nickname = member.user?.tag || member.nickname || memberId;
    const isMuted = !!member.voice?.selfMute;
    const isDeaf = !!member.voice?.selfDeaf;

    await db.updateSessionState(memberId, nickname, isMuted, isDeaf, isAlone);
  }
}

export async function processVoiceStateUpdate(oldState: any, newState: any, { client, db }: any) {
  try {
    const userId = newState.id;
    const nickname = newState.member?.user?.tag || newState.id;

    const wasInChannel = !!oldState.channelId;
    const isInChannel = !!newState.channelId;

    // If user joined a channel
    if (!wasInChannel && isInChannel) {
      const isMuted = !!newState.selfMute;
      const isDeaf = !!newState.selfDeaf;
      const isAlone = newState.channel?.members.size === 1;
      const guildId = newState.guild?.id || newState.channel?.guild?.id || null;
      await db.upsertSession(
        userId,
        guildId,
        newState.channelId,
        Date.now(),
        isMuted,
        isDeaf,
        isAlone
      );
      await updateChannelMembers(newState.channel, userId, db);
      return;
    }

    // If user left a channel
    if (wasInChannel && !isInChannel) {
      await db.endSessionAndAdd(userId, nickname);
      await updateChannelMembers(oldState.channel, userId, db);
      return;
    }

    // If user switched channels without disconnecting
    if (isInChannel && wasInChannel && newState.channelId !== oldState.channelId) {
      await db.endSessionAndAdd(userId, nickname);
      const isMuted = !!newState.selfMute;
      const isDeaf = !!newState.selfDeaf;
      const isAlone = newState.channel?.members.size === 1;
      const guildId = newState.guild?.id || newState.channel?.guild?.id || null;
      await db.upsertSession(
        userId,
        guildId,
        newState.channelId,
        Date.now(),
        isMuted,
        isDeaf,
        isAlone
      );
      await updateChannelMembers(oldState.channel, userId, db);
      await updateChannelMembers(newState.channel, userId, db);
      return;
    }

    // If user stayed in the same channel but state changed (mute/deaf/alone)
    if (isInChannel && wasInChannel && newState.channelId === oldState.channelId) {
      const oldMuted = !!oldState.selfMute;
      const oldDeaf = !!oldState.selfDeaf;
      const oldAlone = oldState.channel?.members.size === 1;

      const newMuted = !!newState.selfMute;
      const newDeaf = !!newState.selfDeaf;
      const newAlone = newState.channel?.members.size === 1;

      if (oldMuted !== newMuted || oldDeaf !== newDeaf || oldAlone !== newAlone) {
        await db.updateSessionState(userId, nickname, newMuted, newDeaf, newAlone);
        await updateChannelMembers(newState.channel, userId, db);
      }
    }
  } catch (err) {
    console.error('Error handling voiceStateUpdate:', err);
  }
}

export default {
  name: 'voiceStateUpdate',
  async execute(oldState: any, newState: any, context: any) {
    await processVoiceStateUpdate(oldState, newState, context);
  },
};
