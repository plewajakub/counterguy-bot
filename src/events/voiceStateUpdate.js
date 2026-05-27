module.exports = {
  name: 'voiceStateUpdate',
  async execute(oldState, newState, { client, db }) {
    try {
      const userId = newState.id;
      const nickname = newState.member?.user?.tag || newState.id;

      const wasInChannel = !!oldState.channelId;
      const isInChannel = !!newState.channelId;

      // If user joined a channel
      if (!wasInChannel && isInChannel) {
        // start session
        const isMuted = !!newState.selfMute;
        const isDeaf = !!newState.selfDeaf;
        const isAlone = newState.channel?.members.size === 1;
        await db.upsertSession(userId, newState.channelId, Date.now(), isMuted, isDeaf, isAlone);
        return;
      }

      // If user left a channel
      if (wasInChannel && !isInChannel) {
        // end session and add minutes
        await db.endSessionAndAdd(userId, nickname);
        return;
      }

      // If user stayed in a channel but state changed (mute/deaf or member count changed)
      if (isInChannel && wasInChannel && newState.channelId === oldState.channelId) {
        const oldMuted = !!oldState.selfMute;
        const oldDeaf = !!oldState.selfDeaf;
        const oldAlone = oldState.channel?.members.size === 1;

        const newMuted = !!newState.selfMute;
        const newDeaf = !!newState.selfDeaf;
        const newAlone = newState.channel?.members.size === 1;

        // If any relevant flag changed, account minutes for previous state and update session
        if (oldMuted !== newMuted || oldDeaf !== newDeaf || oldAlone !== newAlone) {
          await db.updateSessionState(userId, nickname, newMuted, newDeaf, newAlone);
        }
      }
    } catch (err) {
      console.error('Error handling voiceStateUpdate:', err);
    }
  },
};
