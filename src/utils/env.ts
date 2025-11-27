export type EnvConfig = {
  token: string;
  clientId: string;
  guildId: string;
};

export function loadEnv(): EnvConfig {
  const token = process.env.DISCORD_TOKEN;
  const clientId = process.env.CLIENT_ID;
  const guildId = process.env.GUILD_ID;

  const missing = [
    ["DISCORD_TOKEN", token],
    ["CLIENT_ID", clientId],
    ["GUILD_ID", guildId],
  ]
    .filter(([, value]) => !value)
    .map(([key]) => key);

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  }

  return {
    token: token!,
    clientId: clientId!,
    guildId: guildId!,
  };
}
