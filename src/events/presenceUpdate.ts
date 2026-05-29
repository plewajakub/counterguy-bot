export default {
  name: 'presenceUpdate',
  async execute(oldPresence: any, newPresence: any, { client, db }: any) {
    try {
      if (!newPresence || !newPresence.member) return;
      const userId = newPresence.member.id;
      const guildId = newPresence.guild?.id || null;
      if (!guildId) return;

      // Check if user is currently in a voice session
      const session = await db.getSession(userId);
      if (!session) return;

      // Get the current game from activities
      const activities = newPresence.activities || [];
      const gameActivity = activities.find((a: any) => a.type === 0); // type 0 = Game/Playing
      const gameName = gameActivity ? gameActivity.name : null;

      // Only update if game actually changed
      if (session.game_name !== gameName) {
        await db.updateSessionGame(userId, gameName);
      }
    } catch (err) {
      console.error('Error handling presenceUpdate:', err);
    }
  },
};
