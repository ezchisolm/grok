import { REST, Routes } from "discord.js";
import { commands } from "./commands/index";
import { loadEnv } from "./utils/env";
import { logger } from "./utils/logger";

async function main() {
  const env = loadEnv();
  const rest = new REST({ version: "10" }).setToken(env.token);
  const payload = commands.map((command) => command.data.toJSON());

  logger.info(`Deploying ${payload.length} commands to guild ${env.guildId}`);

  await rest.put(Routes.applicationGuildCommands(env.clientId, env.guildId), {
    body: payload,
  });

  logger.info("Slash commands registered.");
}

main().catch((error) => {
  logger.error(`Command deployment failed: ${(error as Error).message}`);
  process.exit(1);
});
