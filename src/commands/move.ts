import { SlashCommandBuilder, MessageFlags } from "discord.js";
import type { BotCommand } from "./types";

const move: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("move")
    .setDescription("Move a track to a different position in the queue")
    .addIntegerOption((option) =>
      option
        .setName("from")
        .setDescription("Current position of the track")
        .setMinValue(1)
        .setRequired(true),
    )
    .addIntegerOption((option) =>
      option
        .setName("to")
        .setDescription("New position for the track")
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
    const from = interaction.options.getInteger("from", true);
    const to = interaction.options.getInteger("to", true);

    try {
      const success = controller.moveInQueue(from, to);
      
      if (!success) {
        await interaction.reply({
          content: `❌ Invalid position(s). Queue has **${controller.queueItems.length}** track(s).`,
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      logger.info(`[Move] Moved track from position ${from} to ${to}`);
      
      await interaction.reply({
        content: `↔️ Moved track from position **${from}** to **${to}**.`,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      logger.error(`[Move] Failed to move track: ${message}`);
      await interaction.reply({
        content: `❌ ${message}`,
        flags: MessageFlags.Ephemeral,
      });
    }
  },
};

export default move;
