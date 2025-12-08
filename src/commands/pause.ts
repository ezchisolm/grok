import { SlashCommandBuilder, MessageFlags } from "discord.js";
import { AudioPlayerStatus } from "@discordjs/voice";
import type { BotCommand } from "./types";

const pause: BotCommand = {
  data: new SlashCommandBuilder().setName("pause").setDescription("Pause the current track"),

  async execute(interaction, { music }) {
    if (!interaction.guild) {
      await interaction.reply({ content: "This command only works inside a server.", flags: MessageFlags.Ephemeral });
      return;
    }

    const controller = music.get(interaction.guild.id);

    if (!controller.nowPlaying) {
      await interaction.reply({ content: "Nothing is playing to pause.", flags: MessageFlags.Ephemeral });
      return;
    }

    if (controller.status === AudioPlayerStatus.Paused) {
      await interaction.reply({ content: "Playback is already paused.", flags: MessageFlags.Ephemeral });
      return;
    }

    const success = controller.pause();

    if (!success) {
      await interaction.reply({ content: "Sorry, I couldn't pause playback.", flags: MessageFlags.Ephemeral });
      return;
    }

    await interaction.reply("Paused playback.");
  },
};

export default pause;
