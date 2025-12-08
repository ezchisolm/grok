import * as ytdlp from "./ytdlp";
import type { Track } from "./queue";

export async function resolveTrack(query: string, requestedBy: string): Promise<Track> {
  const results = await ytdlp.search(query);
  const first = results[0];

  if (!first) {
    throw new Error("No results found for your query.");
  }

  return {
    title: first.title ?? "Unknown title",
    url: first.url,
    requestedBy,
    duration: first.durationInSec,
  };
}

export function formatDuration(seconds?: number): string {
  if (seconds === undefined || Number.isNaN(seconds) || seconds < 0) {
    return "?:??";
  }

  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  const parts = [mins.toString().padStart(2, "0"), secs.toString().padStart(2, "0")];

  if (hrs > 0) {
    parts.unshift(hrs.toString());
  }

  return parts.join(":");
}