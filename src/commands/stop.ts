import { SlashCommandBuilder } from "discord.js";
import type { BotCommand } from "./types";

const stop: BotCommand = {
  data: new SlashCommandBuilder().setName("stop").setDescription("Stop playback and clear the queue"),

  async execute(interaction, { music, logger }) {
    if (!interaction.guild) {
      await interaction.reply({ content: "This command only works inside a server.", ephemeral: true });
      return;
    }

    try {
      const controller = music.get(interaction.guild.id);
      await controller.stop();
      await interaction.reply("Stopped playback and cleared the queue.");
    } catch (error) {
      logger.error(`Failed to stop playback: ${(error as Error).message}`);
      await interaction.reply({ content: "Sorry, I couldn't stop playback.", ephemeral: true });
    }
  },
};

export default stop;
