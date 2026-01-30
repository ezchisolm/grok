import { SlashCommandBuilder, MessageFlags } from "discord.js";
import type { BotCommand } from "./types";

const autoplay: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("autoplay")
    .setDescription("Toggle autoplay - automatically play related songs when queue ends")
    .addBooleanOption((option) =>
      option
        .setName("enabled")
        .setDescription("Enable or disable autoplay")
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
    const enabledOption = interaction.options.getBoolean("enabled");

    // If no option provided, toggle current state
    if (enabledOption === null) {
      const currentState = controller.getAutoplay();
      const newState = controller.setAutoplay(!currentState);
      const emoji = newState ? "▶️" : "⏹️";
      const status = newState ? "enabled" : "disabled";
      
      logger.info(`[Autoplay] Toggled to ${newState} in guild ${interaction.guild.id}`);
      await interaction.reply({
        content: `${emoji} Autoplay **${status}**.`,
      });
      return;
    }

    // Set specific state
    const newState = controller.setAutoplay(enabledOption);
    const emoji = newState ? "▶️" : "⏹️";
    const status = newState ? "enabled" : "disabled";
    
    logger.info(`[Autoplay] Set to ${newState} in guild ${interaction.guild.id}`);
    await interaction.reply({
      content: `${emoji} Autoplay **${status}**.`,
    });
  },
};

export default autoplay;
