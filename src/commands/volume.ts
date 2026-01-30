import { SlashCommandBuilder, MessageFlags } from "discord.js";
import type { BotCommand } from "./types";
import { validateVolume } from "../utils/validation";

const volume: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("volume")
    .setDescription("Adjust the playback volume")
    .addIntegerOption((option) =>
      option
        .setName("level")
        .setDescription("Volume level (0-200%)")
        .setMinValue(0)
        .setMaxValue(200)
        .setRequired(false),
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
    
    // If no level provided, show current volume
    const levelOption = interaction.options.getInteger("level");
    
    if (levelOption === null) {
      const currentVolume = controller.getVolume();
      const emoji = controller.getVolumeEmoji();
      await interaction.reply({
        content: `${emoji} Current volume: **${currentVolume}%**`,
      });
      return;
    }

    try {
      const validatedVolume = validateVolume(levelOption);
      const actualVolume = controller.setVolume(validatedVolume);
      const emoji = controller.getVolumeEmoji();
      
      logger.info(`[Volume] Set volume to ${actualVolume}% in guild ${interaction.guild.id}`);
      
      await interaction.reply({
        content: `${emoji} Volume set to **${actualVolume}%**`,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Invalid volume";
      logger.error(`[Volume] Failed to set volume: ${message}`);
      await interaction.reply({
        content: `❌ ${message}`,
        flags: MessageFlags.Ephemeral,
      });
    }
  },
};

export default volume;
