// Validate Bun version before imports (yt-dlp requires Bun >= 1.0.31)
const [majorStr, minorStr, patchStr] = Bun.version.split('.');
const major = Number(majorStr);
const minor = Number(minorStr);
const patch = Number(patchStr);
if (major < 1 || (major === 1 && minor < 0) || (major === 1 && minor === 0 && patch < 31)) {
  throw new Error(`Bun v1.0.31+ required for yt-dlp JavaScript runtime support. Current: ${Bun.version}`);
}
if (major === 1 && (minor < 2 || (minor === 2 && patch < 16))) {
  console.warn(`[WARN] Bun v1.2.16+ recommended for memory leak fixes. Current: ${Bun.version}`);
}

import { Client, Events, GatewayIntentBits, MessageFlags } from "discord.js";
import { commandMap } from "./commands/index";
import { loadEnv } from "./utils/env";
import { logger } from "./utils/logger";
import { MusicManager } from "./music/player";

const env = loadEnv();
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates],
});

const musicManager = new MusicManager(logger);

process.on("unhandledRejection", (reason) => {
  logger.error(`Unhandled rejection: ${String(reason)}`);
});

process.on("uncaughtException", (error) => {
  logger.error(`Uncaught exception: ${(error as Error).message}`);
});

client.once(Events.ClientReady, (c) => {
  logger.info(`Logged in as ${c.user.tag}`);
});

// Cleanup when bot leaves a guild
client.on(Events.GuildDelete, (guild) => {
  logger.info(`Left guild ${guild.id}, cleaning up...`);
  musicManager.remove(guild.id);
});

// Cleanup on process termination
process.on("SIGINT", () => {
  logger.info("Received SIGINT, cleaning up...");
  for (const guildId of musicManager.getActiveGuilds()) {
    musicManager.remove(guildId);
  }
  client.destroy();
  process.exit(0);
});

process.on("SIGTERM", () => {
  logger.info("Received SIGTERM, cleaning up...");
  for (const guildId of musicManager.getActiveGuilds()) {
    musicManager.remove(guildId);
  }
  client.destroy();
  process.exit(0);
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) {
    return;
  }

  const command = commandMap.get(interaction.commandName);

  if (!command) {
    await interaction.reply({ content: "I don't know that command.", flags: MessageFlags.Ephemeral });
    return;
  }

  try {
    await command.execute(interaction, { music: musicManager, logger });
  } catch (error) {
    logger.error(`Error executing command ${interaction.commandName}: ${(error as Error).message}`);

    try {
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply("Sorry, something went wrong running that command.");
      } else {
        await interaction.reply({ content: "Sorry, something went wrong running that command.", flags: MessageFlags.Ephemeral });
      }
    } catch (replyError) {
      logger.error(`Failed to send error message to user: ${(replyError as Error).message}`);
    }
  }
});

client.login(env.token);
