import { SlashCommandBuilder } from "discord.js";
import { AudioPlayerStatus } from "@discordjs/voice";
import type { BotCommand } from "./types";

const pause: BotCommand = {
  data: new SlashCommandBuilder().setName("pause").setDescription("Pause the current track"),

  async execute(interaction, { music }) {
    if (!interaction.guild) {
      await interaction.reply({ content: "This command only works inside a server.", ephemeral: true });
      return;
    }

    const controller = music.get(interaction.guild.id);

    if (!controller.nowPlaying) {
      await interaction.reply({ content: "Nothing is playing to pause.", ephemeral: true });
      return;
    }

    if (controller.status === AudioPlayerStatus.Paused) {
      await interaction.reply({ content: "Playback is already paused.", ephemeral: true });
      return;
    }

    const success = controller.pause();

    if (!success) {
      await interaction.reply({ content: "Sorry, I couldn't pause playback.", ephemeral: true });
      return;
    }

    await interaction.reply("Paused playback.");
  },
};

export default pause;
