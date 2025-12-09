import { Innertube } from "youtubei.js";
import { StreamType } from "@discordjs/voice";
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
    const streaming = await getStreamingInfo(client, details.id);

    return {
      title: details.title ?? "Unknown title",
      url: `https://www.youtube.com/watch?v=${details.id}`,
      requestedBy,
      duration: details.duration ?? undefined,
      ...streaming,
    };
  }

  const results = await client.search(query, { type: "video" });
  const first = results.results.find((item) => {
    const type = (item as unknown as { type?: string; constructor?: { type?: string } }).type;
    const ctorType = (item as unknown as { constructor?: { type?: string } }).constructor?.type;
    return type === "CompactVideo" || ctorType === "CompactVideo" || Boolean((item as { id?: string }).id);
  });

  if (!first || !(first as { id?: string }).id) {
    throw new Error("No results found for your query.");
  }

  const id = (first as { id?: string }).id!;
  const title = (first as { title?: { toString(): string } }).title?.toString() ?? "Unknown title";
  const seconds = (first as { duration?: { seconds?: number } }).duration?.seconds;

  return {
    title,
    url: `https://www.youtube.com/watch?v=${id}`,
    requestedBy,
    duration: seconds,
    ...(await getStreamingInfo(client, id)),
  };
}

async function getStreamingInfo(client: Innertube, videoId?: string | null) {
  if (!videoId) {
    return {};
  }

  try {
    const format = await client.getStreamingData(videoId, { type: "audio", format: "any", quality: "bestefficiency" });
    const mime = format.mime_type ?? "";
    const isOpus = mime.includes("opus") || mime.includes("webm");

    return {
      streamUrl: format.url,
      inputType: isOpus ? StreamType.WebmOpus : StreamType.Arbitrary,
    };
  } catch (error) {
    console.warn(`[youtubei] Failed to fetch streaming data for ${videoId}: ${(error as Error).message}`);
    return {};
  }
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
