import { SlashCommandBuilder, MessageFlags } from "discord.js";
import type { BotCommand } from "./types";

const playlist: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("playlist")
    .setDescription("Save and manage playlists (in-memory only)")
    .addSubcommand((subcommand) =>
      subcommand
        .setName("save")
        .setDescription("Save the current queue as a playlist")
        .addStringOption((option) =>
          option
            .setName("name")
            .setDescription("Name for the playlist")
            .setRequired(true)
            .setMaxLength(50),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("load")
        .setDescription("Load a saved playlist")
        .addStringOption((option) =>
          option
            .setName("name")
            .setDescription("Name of the playlist to load")
            .setRequired(true),
        )
        .addBooleanOption((option) =>
          option
            .setName("append")
            .setDescription("Append to current queue instead of replacing")
            .setRequired(false),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("delete")
        .setDescription("Delete a saved playlist")
        .addStringOption((option) =>
          option
            .setName("name")
            .setDescription("Name of the playlist to delete")
            .setRequired(true),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand.setName("list").setDescription("List all saved playlists"),
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
    const subcommand = interaction.options.getSubcommand();

    try {
      switch (subcommand) {
        case "save": {
          const name = interaction.options.getString("name", true);
          controller.savePlaylist(name);
          logger.info(`[Playlist] Saved playlist "${name}" in guild ${interaction.guild.id}`);
          await interaction.reply({
            content: `💾 Playlist **"${name}"** saved with **${controller.queueItems.length + (controller.nowPlaying ? 1 : 0)}** track(s).`,
          });
          break;
        }

        case "load": {
          const name = interaction.options.getString("name", true);
          const append = interaction.options.getBoolean("append") ?? false;
          
          const trackCount = controller.loadPlaylist(name, append);
          logger.info(`[Playlist] Loaded playlist "${name}" (${trackCount} tracks, append=${append})`);
          
          const action = append ? "added to" : "loaded into";
          await interaction.reply({
            content: `📂 Playlist **"${name}"** ${action} queue (**${trackCount}** tracks).`,
          });
          break;
        }

        case "delete": {
          const name = interaction.options.getString("name", true);
          const deleted = controller.deletePlaylist(name);
          
          if (!deleted) {
            await interaction.reply({
              content: `❌ Playlist **"${name}"** not found.`,
              flags: MessageFlags.Ephemeral,
            });
            return;
          }
          
          logger.info(`[Playlist] Deleted playlist "${name}"`);
          await interaction.reply({
            content: `🗑️ Playlist **"${name}"** deleted.`,
          });
          break;
        }

        case "list": {
          const playlists = controller.listPlaylists();
          
          if (playlists.length === 0) {
            await interaction.reply({
              content: "📂 No saved playlists. Use `/playlist save <name>` to create one.",
            });
            return;
          }
          
          const list = playlists
            .map((p) => `• **${p.name}** (${p.trackCount} tracks)`)
            .join("\n");
          
          await interaction.reply({
            content: `📂 **Saved Playlists** (${playlists.length}/10):\n${list}`,
          });
          break;
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      logger.error(`[Playlist] ${subcommand} failed: ${message}`);
      await interaction.reply({
        content: `❌ ${message}`,
        flags: MessageFlags.Ephemeral,
      });
    }
  },
};

export default playlist;
