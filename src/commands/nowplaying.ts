import { SlashCommandBuilder, MessageFlags } from "discord.js";
import type { BotCommand } from "./types";
import { formatDuration } from "../music/youtube";

const nowPlaying: BotCommand = {
  data: new SlashCommandBuilder().setName("nowplaying").setDescription("Show the current track"),

  async execute(interaction, { music }) {
    if (!interaction.guild) {
      await interaction.reply({ content: "This command only works inside a server.", flags: MessageFlags.Ephemeral });
      return;
    }

    const controller = music.get(interaction.guild.id);
    const current = controller.nowPlaying;

    if (!current) {
      await interaction.reply({ content: "Nothing is playing right now.", flags: MessageFlags.Ephemeral });
      return;
    }

    await interaction.reply(
      `Now playing: **${current.title}** (${formatDuration(current.duration)}) • requested by ${current.requestedBy}`,
    );
  },
};

export default nowPlaying;
