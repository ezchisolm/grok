import play from "./play";
import skip from "./skip";
import stop from "./stop";
import pause from "./pause";
import resume from "./resume";
import queue from "./queue";
import nowPlaying from "./nowplaying";
import type { BotCommand } from "./types";

export const commands: BotCommand[] = [play, skip, stop, pause, resume, queue, nowPlaying];
export const commandMap = new Map(commands.map((command) => [command.data.name, command]));

export type { BotCommand } from "./types";
