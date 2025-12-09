import { spawn, execSync } from "child_process";
import { Readable } from "stream";
import { StreamType } from "@discordjs/voice";
import path from "path";
import fs from "fs";
import https from "node:https";
import { URL } from "node:url";
import type { Track } from "./queue";
import { getCookieHeader } from "../utils/cookies";

const YTDLP_PATH = path.resolve(process.cwd(), "yt-dlp");
const COOKIES_PATH = path.resolve(process.cwd(), "cookies.txt");

// Get the full path to Bun (used only for yt-dlp fallback)
let BUN_PATH = "bun";
try {
  BUN_PATH = execSync("which bun", { encoding: "utf-8" }).trim();
  console.log(`[yt-dlp] Found Bun at: ${BUN_PATH}`);
} catch (e) {
  console.warn('[yt-dlp] Could not find Bun path, using "bun" and hoping it\'s in PATH');
}

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.5993.70 Safari/537.36";

const baseHeaders = {
  "User-Agent": USER_AGENT,
  "Accept-Language": "en-US,en;q=0.9",
};

export async function createStream(track: Track): Promise<{ stream: Readable; type: StreamType }> {
  const cookieHeader = getCookieHeader();
  const headers = {
    ...baseHeaders,
    ...(cookieHeader ? { cookie: cookieHeader } : {}),
  };

  if (track.streamUrl) {
    try {
      const stream = await openHttpStream(track.streamUrl, headers);
      return { stream, type: track.inputType ?? StreamType.Arbitrary };
    } catch (error) {
      console.warn(`[stream] Failed to use pre-fetched stream URL, falling back to yt-dlp: ${(error as Error).message}`);
    }
  }

  return spawnYtDlpStream(track.url, cookieHeader);
}

function spawnYtDlpStream(url: string, cookieHeader?: string) {
  const args = ["-f", "bestaudio", "-q", "--no-warnings", "--buffer-size", "16K", "--js-runtimes", `bun:${BUN_PATH}`];

  if (fs.existsSync(COOKIES_PATH) || cookieHeader) {
    args.push("--cookies", COOKIES_PATH);
  } else {
    args.push("--extractor-args", "youtube:player_client=android_music");
  }

  args.push("-o", "-", url);

  const process = spawn(YTDLP_PATH, args, {
    stdio: ["ignore", "pipe", "ignore"],
  });

  process.on("error", (err) => {
    console.error(`[yt-dlp] Failed to spawn process for stream: ${err.message}`);
  });

  if (!process.stdout) {
    throw new Error("Failed to create stdout stream");
  }

  return {
    stream: process.stdout,
    type: StreamType.Arbitrary,
  };
}

async function openHttpStream(url: string, headers: Record<string, string>, redirects = 0): Promise<Readable> {
  if (redirects > 3) {
    throw new Error("Too many redirects");
  }

  return new Promise((resolve, reject) => {
    const request = https.get(url, { headers }, (response) => {
      const status = response.statusCode ?? 0;

      if (status >= 300 && status < 400 && response.headers.location) {
        const location = response.headers.location.startsWith("http")
          ? response.headers.location
          : new URL(response.headers.location, url).toString();

        response.resume(); // discard
        openHttpStream(location, headers, redirects + 1).then(resolve).catch(reject);
        return;
      }

      if (status < 200 || status >= 300) {
        response.resume();
        reject(new Error(`HTTP ${status}`));
        return;
      }

      resolve(response);
    });

    request.on("error", reject);
  });
}
