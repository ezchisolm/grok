import { SlashCommandBuilder } from "discord.js";
import type { BotCommand } from "./types";
import { formatDuration } from "../music/youtube";

const queue: BotCommand = {
  data: new SlashCommandBuilder().setName("queue").setDescription("Show the upcoming tracks"),

  async execute(interaction, { music }) {
    if (!interaction.guild) {
      await interaction.reply({ content: "This command only works inside a server.", ephemeral: true });
      return;
    }

    const controller = music.get(interaction.guild.id);
    const nowPlaying = controller.nowPlaying;
    const items = controller.queueItems;

    if (!nowPlaying && items.length === 0) {
      await interaction.reply({ content: "The queue is empty.", ephemeral: true });
      return;
    }

    const lines: string[] = [];

    if (nowPlaying) {
      lines.push(
        `Now playing: **${nowPlaying.title}** (${formatDuration(nowPlaying.duration)}) • requested by ${nowPlaying.requestedBy}`,
      );
    }

    if (items.length > 0) {
      const listing = items.slice(0, 10).map((track, index) => {
        const position = index + 1;
        return `${position}. ${track.title} (${formatDuration(track.duration)}) • requested by ${track.requestedBy}`;
      });

      lines.push("Up next:");
      lines.push(...listing);

      if (items.length > 10) {
        lines.push(`...and ${items.length - 10} more.`);
      }
    }

    await interaction.reply(lines.join("\n"));
  },
};

export default queue;
