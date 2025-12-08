import { Client, Events, GatewayIntentBits } from "discord.js";
import playdl from "play-dl";
import { commandMap } from "./commands/index";
import { loadEnv } from "./utils/env";
import { logger } from "./utils/logger";
import { MusicManager } from "./music/player";

const env = loadEnv();
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates],
});

const musicManager = new MusicManager(logger);

// Initialize play-dl for YouTube support
(async () => {
  try {
    // Refresh YouTube tokens to avoid rate limiting
    await playdl.refreshToken();
    logger.info("play-dl YouTube tokens refreshed successfully");
  } catch (error) {
    logger.warn(`play-dl token refresh warning (this is usually fine): ${(error as Error).message}`);
  }
})();

process.on("unhandledRejection", (reason) => {
  logger.error(`Unhandled rejection: ${String(reason)}`);
});

process.on("uncaughtException", (error) => {
  logger.error(`Uncaught exception: ${(error as Error).message}`);
});

client.once(Events.ClientReady, (c) => {
  logger.info(`Logged in as ${c.user.tag}`);
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) {
    return;
  }

  const command = commandMap.get(interaction.commandName);

  if (!command) {
    await interaction.reply({ content: "I don't know that command.", ephemeral: true });
    return;
  }

  try {
    await command.execute(interaction, { music: musicManager, logger });
  } catch (error) {
    logger.error(`Error executing command ${interaction.commandName}: ${(error as Error).message}`);

    if (interaction.deferred || interaction.replied) {
      await interaction.editReply("Sorry, something went wrong running that command.");
    } else {
      await interaction.reply({ content: "Sorry, something went wrong running that command.", ephemeral: true });
    }
  }
});

client.login(env.token);
