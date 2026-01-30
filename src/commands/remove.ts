import { SlashCommandBuilder, MessageFlags } from "discord.js";
import type { BotCommand } from "./types";

const remove: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("remove")
    .setDescription("Remove a track from the queue")
    .addIntegerOption((option) =>
      option
        .setName("position")
        .setDescription("Position in queue to remove (1 = next track)")
        .setMinValue(1)
        .setRequired(true),
    ),

  async execute(interaction, { music, logger }) {
    if (!interaction.guild) {
      await interaction.reply({
        content: "This command only works inside a server.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const controller = music.get(interaction.guild.id);
    const position = interaction.options.getInteger("position", true);

    try {
      const removed = controller.removeFromQueue(position);
      
      if (!removed) {
        await interaction.reply({
          content: `❌ No track found at position **${position}**.`,
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      logger.info(`[Remove] Removed "${removed.title}" from queue at position ${position}`);
      
      await interaction.reply({
        content: `🗑️ Removed **${removed.title}** from the queue.`,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      logger.error(`[Remove] Failed to remove track: ${message}`);
      await interaction.reply({
        content: `❌ ${message}`,
        flags: MessageFlags.Ephemeral,
      });
    }
  },
};

export default remove;
