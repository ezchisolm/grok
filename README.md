# Discord Music Bot

A private Discord music bot that can search for songs on YouTube and play them in voice channels.

## Features

- 🎵 Play music from YouTube by search query or URL
- ⏭️ Skip, pause, resume, and stop playback
- 📋 View current queue and now playing
- 🎧 Automatic voice channel handling
- 🔊 High-quality audio streaming

## Prerequisites

[Bun](https://bun.sh/) runtime (required)
- A Discord bot token from the [Discord Developer Portal](https://discord.com/developers/applications)
- FFmpeg (automatically included via `ffmpeg-static` dependency)

## Setup

1. **Clone the repository**
   ```bash
   git clone https://github.com/ezchisolm/grok.git
   cd grok
   ```

2. **Install dependencies**
   ```bash
   bun install
   ```

3. **Configure environment variables**
   
   Copy `.env.example` to `.env` and fill in your Discord bot credentials:
   ```bash
   cp .env.example .env
   ```
   
   Edit `.env` with your values:
   ```env
   DISCORD_TOKEN=your_bot_token_here
   CLIENT_ID=your_client_id_here
   GUILD_ID=your_guild_id_here
   ```

   **How to get these values:**
   - `DISCORD_TOKEN`: From Discord Developer Portal → Your Application → Bot → Token
   - `CLIENT_ID`: From Discord Developer Portal → Your Application → General Information → Application ID
   - `GUILD_ID`: Right-click your Discord server → Copy Server ID (enable Developer Mode in Discord settings first)

4. **Build the bot**
   ```bash
   bun run build
   ```

5. **Deploy slash commands**
   ```bash
   bun run deploy
   ```

6. **Start the bot**
   ```bash
   bun run dev
   ```

## Commands

The bot uses Discord slash commands:

- `/play <query>` - Search YouTube and play a song (or provide a YouTube URL)
- `/skip` - Skip the currently playing song
- `/stop` - Stop playback and clear the queue
- `/pause` - Pause the current song
- `/resume` - Resume playback
- `/queue` - View the current queue
- `/nowplaying` - Show the currently playing song

## Usage Example

1. Join a voice channel in your Discord server
2. Use `/play never gonna give you up` to search and play a song
3. The bot will join your voice channel and start playing
4. Use `/queue` to see upcoming songs
5. Use `/skip` to move to the next song

## Development

Run in development mode with hot reload:
```bash
bun run dev
```

Run tests:
```bash
bun test
```

Build TypeScript:
```bash
bun run build
```

## VPS Deployment with PM2

For running the bot on a VPS with process management (auto-restart on crash, etc.):

1. **Install PM2 globally**
   ```bash
   bun add -g pm2
   ```

2. **Start the bot with PM2**
   ```bash
   pm2 start ecosystem.config.cjs
   ```

3. **View logs**
   ```bash
   pm2 logs grok-music
   ```

4. **Monitor processes**
   ```bash
   pm2 monit
   ```

5. **Stop the bot**
   ```bash
   pm2 stop grok-music
   ```

6. **Restart the bot**
   ```bash
   pm2 restart grok-music
   ```

7. **Save PM2 config to auto-start on boot**
   ```bash
   pm2 save
   pm2 startup
   ```

## Project Structure

```
grok/
├── src/
│   ├── commands/        # Slash command implementations
│   ├── music/          # Music player and YouTube integration
│   ├── utils/          # Utility functions (logger, env)
│   ├── index.ts        # Bot entry point
│   └── deploy-commands.ts
├── tests/              # Unit tests
├── .env.example        # Environment variable template
└── package.json
```

## Dependencies

- `discord.js` - Discord bot framework
- `@discordjs/voice` - Voice connection handling
- `play-dl` - YouTube search and streaming
- `ffmpeg-static` - Audio processing
- `libsodium-wrappers` - Audio encryption

## License

Private use only.

---

This project uses Bun runtime for fast execution.
