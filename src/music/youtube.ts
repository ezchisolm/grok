import { Innertube } from "youtubei.js";
import CompactVideo from "youtubei.js/dist/src/parser/classes/CompactVideo.js";
import type { Track } from "./queue";
import { getCookieHeader } from "../utils/cookies";

let youtubeClient: Promise<Innertube> | undefined;

async function getClient(): Promise<Innertube> {
  if (!youtubeClient) {
    youtubeClient = Innertube.create({
      cookie: getCookieHeader(),
    });
  }

  return youtubeClient;
}

export async function resolveTrack(query: string, requestedBy: string): Promise<Track> {
  const client = await getClient();

  // Direct URLs can skip search
  if (query.startsWith("http")) {
    const info = await client.getBasicInfo(query);
    const details = info.basic_info;

    return {
      title: details.title ?? "Unknown title",
      url: `https://www.youtube.com/watch?v=${details.id}`,
      requestedBy,
      duration: details.duration ?? undefined,
    };
  }

  const results = await client.search(query, { type: "video" });
  const first = results.results.firstOfType(CompactVideo);

  if (!first) {
    throw new Error("No results found for your query.");
  }

  return {
    title: first.title.toString(),
    url: `https://www.youtube.com/watch?v=${first.id}`,
    requestedBy,
    duration: first.duration?.seconds,
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
