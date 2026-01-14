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
