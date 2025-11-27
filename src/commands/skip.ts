import { SlashCommandBuilder } from "discord.js";
import type { BotCommand } from "./types";

const skip: BotCommand = {
  data: new SlashCommandBuilder().setName("skip").setDescription("Skip the current track"),

  async execute(interaction, { music, logger }) {
    if (!interaction.guild) {
      await interaction.reply({ content: "This command only works inside a server.", ephemeral: true });
      return;
    }

    const controller = music.get(interaction.guild.id);
    const current = controller.nowPlaying;

    if (!current) {
      await interaction.reply({ content: "Nothing is playing right now.", ephemeral: true });
      return;
    }

    try {
      await controller.skip();
      await interaction.reply(`Skipped: **${current.title}**`);
    } catch (error) {
      logger.error(`Failed to skip track: ${(error as Error).message}`);
      await interaction.reply({ content: "Sorry, I couldn't skip that track.", ephemeral: true });
    }
  },
};

export default skip;
