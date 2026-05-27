import { Interaction } from 'discord.js';
import voicetimeCommand from '../commands/voicetime';

export default {
  name: 'interactionCreate',
  async execute(interaction: Interaction, { client, db }: any) {
    try {
      if (interaction.isChatInputCommand()) {
        const { commandName } = interaction;
        if (commandName === 'voicetime') {
          await voicetimeCommand.execute(interaction, { client, db });
        }
        return;
      }

      if (interaction.isButton()) {
        await voicetimeCommand.handleButtonInteraction(interaction, { client, db });
      }
    } catch (err) {
      console.error('interactionCreate error:', err);
    }
  },
};
