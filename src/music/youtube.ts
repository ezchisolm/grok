import playdl from "play-dl";
import type { Track } from "./queue";

export async function resolveTrack(query: string, requestedBy: string): Promise<Track> {
  const validation = playdl.yt_validate(query);

  if (validation === "video") {
    const info = await playdl.video_info(query);
    const details = info.video_details;

    return {
      title: details.title ?? "Unknown title",
      url: details.url,
      requestedBy,
      duration: details.durationInSec,
    };
  }

  const results = await playdl.search(query, {
    source: { youtube: "video" },
    limit: 1,
  });

  const first = results[0];

  if (!first || !first.url) {
    throw new Error("No results found for your query.");
  }

  return {
    title: first.title ?? first.url,
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
