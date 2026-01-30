import { SlashCommandBuilder, MessageFlags } from "discord.js";
import type { BotCommand } from "./types";

const shuffle: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("shuffle")
    .setDescription("Shuffle the current queue randomly"),

  async execute(interaction, { music, logger }) {
    if (!interaction.guild) {
      await interaction.reply({
        content: "This command only works inside a server.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const controller = music.get(interaction.guild.id);
    const queueSize = controller.queueItems.length;

    if (queueSize < 2) {
      await interaction.reply({
        content: "❌ Need at least 2 tracks in the queue to shuffle.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    try {
      controller.shuffleQueue();
      logger.info(`[Shuffle] Shuffled ${queueSize} tracks in guild ${interaction.guild.id}`);
      
      await interaction.reply({
        content: `🔀 Shuffled **${queueSize}** track(s) in the queue!`,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      logger.error(`[Shuffle] Failed to shuffle queue: ${message}`);
      await interaction.reply({
        content: "❌ Failed to shuffle the queue.",
        flags: MessageFlags.Ephemeral,
      });
    }
  },
};

export default shuffle;
