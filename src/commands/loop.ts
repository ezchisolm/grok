import { SlashCommandBuilder, MessageFlags } from "discord.js";
import type { BotCommand } from "./types";
import type { LoopMode } from "../music/player";

const LOOP_MODES: { value: LoopMode; label: string; emoji: string }[] = [
  { value: "off", label: "Off", emoji: "➡️" },
  { value: "track", label: "Track", emoji: "🔂" },
  { value: "queue", label: "Queue", emoji: "🔁" },
];

const loop: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("loop")
    .setDescription("Set the loop mode for playback")
    .addStringOption((option) =>
      option
        .setName("mode")
        .setDescription("Loop mode")
        .setRequired(false)
        .addChoices(
          { name: "➡️ Off", value: "off" },
          { name: "🔂 Track", value: "track" },
          { name: "🔁 Queue", value: "queue" },
        ),
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
    const modeOption = interaction.options.getString("mode") as LoopMode | null;

    // If no mode provided, show current mode and toggle through options
    if (modeOption === null) {
      const currentMode = controller.getLoopMode();
      const modeInfo = LOOP_MODES.find((m) => m.value === currentMode);
      
      await interaction.reply({
        content: `🔂 Loop mode: **${modeInfo?.label ?? "Off"}** ${modeInfo?.emoji ?? "➡️"}\n\nUse "/loop <mode>" to change.`,
      });
      return;
    }

    try {
      const newMode = controller.setLoopMode(modeOption);
      const modeInfo = LOOP_MODES.find((m) => m.value === newMode);
      
      logger.info(`[Loop] Set loop mode to ${newMode} in guild ${interaction.guild.id}`);
      
      let description = "";
      switch (newMode) {
        case "track":
          description = "The current track will repeat when it ends.";
          break;
        case "queue":
          description = "The entire queue will repeat when it ends.";
          break;
        default:
          description = "Playback will continue normally.";
      }
      
      await interaction.reply({
        content: `${modeInfo?.emoji ?? "➡️"} Loop mode set to **${modeInfo?.label ?? "Off"}**\n${description}`,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      logger.error(`[Loop] Failed to set loop mode: ${message}`);
      await interaction.reply({
        content: "❌ Failed to set loop mode.",
        flags: MessageFlags.Ephemeral,
      });
    }
  },
};

export default loop;
