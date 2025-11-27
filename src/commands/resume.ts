import { SlashCommandBuilder } from "discord.js";
import { AudioPlayerStatus } from "@discordjs/voice";
import type { BotCommand } from "./types";

const resume: BotCommand = {
  data: new SlashCommandBuilder().setName("resume").setDescription("Resume paused playback"),

  async execute(interaction, { music }) {
    if (!interaction.guild) {
      await interaction.reply({ content: "This command only works inside a server.", ephemeral: true });
      return;
    }

    const controller = music.get(interaction.guild.id);

    if (!controller.nowPlaying) {
      await interaction.reply({ content: "Nothing is playing to resume.", ephemeral: true });
      return;
    }

    if (controller.status === AudioPlayerStatus.Playing) {
      await interaction.reply({ content: "Playback is already running.", ephemeral: true });
      return;
    }

    const success = controller.resume();

    if (!success) {
      await interaction.reply({ content: "Sorry, I couldn't resume playback.", ephemeral: true });
      return;
    }

    await interaction.reply("Resumed playback.");
  },
};

export default resume;
