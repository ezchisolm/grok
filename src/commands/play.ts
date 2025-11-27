import { SlashCommandBuilder, ChannelType, GuildMember } from "discord.js";
import type { BotCommand } from "./types";
import { formatDuration, resolveTrack } from "../music/youtube";

const play: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("play")
    .setDescription("Play a song from YouTube")
    .addStringOption((option) =>
      option.setName("query").setDescription("Song name or YouTube URL").setRequired(true),
    ),

  async execute(interaction, { music, logger }) {
    if (!interaction.guild) {
      await interaction.reply({ content: "This command only works inside a server.", ephemeral: true });
      return;
    }

    const member =
      interaction.member instanceof GuildMember
        ? interaction.member
        : await interaction.guild.members.fetch(interaction.user.id);

    const voiceChannel = member.voice.channel;

    if (
      !voiceChannel ||
      (voiceChannel.type !== ChannelType.GuildVoice && voiceChannel.type !== ChannelType.GuildStageVoice)
    ) {
      await interaction.reply({
        content: "You need to be in a voice channel to use /play.",
        ephemeral: true,
      });
      return;
    }

    const query = interaction.options.getString("query", true);
    await interaction.deferReply();

    try {
      const requestedBy = `<@${interaction.user.id}>`;
      const track = await resolveTrack(query, requestedBy);
      const controller = music.get(interaction.guild.id);
      const position = await controller.enqueue(track, voiceChannel);

      const description = `**${track.title}** (${formatDuration(track.duration)}) • requested by ${requestedBy}`;
      const header = position === 1 ? "Starting playback" : `Queued at #${position}`;

      await interaction.editReply(`${header}: ${description}`);
    } catch (error) {
      logger.error(`Failed to execute /play: ${(error as Error).message}`);
      const message = error instanceof Error ? error.message : "Unknown error";

      if (interaction.deferred || interaction.replied) {
        await interaction.editReply({ content: `Sorry, I couldn't play that: ${message}` });
      } else {
        await interaction.reply({ content: `Sorry, I couldn't play that: ${message}`, ephemeral: true });
      }
    }
  },
};

export default play;
