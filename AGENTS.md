# AGENTS.md for Grok Discord Music Bot

## Project Overview
This repository contains a Discord music bot named "Grok", built with TypeScript and Discord.js. It supports voice channel music playback from YouTube, with commands for playing, pausing, resuming, skipping, stopping, and queuing tracks.

## Key Dependencies
- `discord.js`: For Discord API interactions.
- `@discordjs/voice`: For voice channel handling.
- `play-dl`: For YouTube audio extraction.
- `ffmpeg-static`: For audio processing.
- Testing: `vitest` for unit tests.

## Project Structure
- `src/index.ts`: Main bot entry point.
- `src/commands/`: Individual command handlers (play, pause, etc.).
- `src/music/`: Music-related logic (player, queue, YouTube integration).
- `src/utils/`: Utilities like environment variables and logging.
- `tests/`: Test files.

## Development Guidelines
- Use TypeScript for all code.
- Follow ES modules (`type: "module"` in package.json).
- Run tests with `npm test` before commits.
- Build with `npm run build` and deploy commands with `npm run deploy`.

## Context7 MCP Usage
Always use context7 when I need code generation, setup or
configuration steps, or library/API documentation. This means
you should automatically use the Context7 MCP tools to resolve
library id and get library docs without me having to
explicitly ask.

## Bun over npm
Always use bun and bunx over npm/npx