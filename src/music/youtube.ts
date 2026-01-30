import * as ytdlp from "./ytdlp";
import type { Track } from "./queue";
import { withRetry, isRetryableError } from "../utils/retry";
import { sanitizeSearchQuery, isYouTubeUrl, validateYouTubeUrl } from "../utils/validation";

export async function resolveTrack(query: string, requestedBy: string): Promise<Track> {
  // Sanitize and validate the query
  const sanitizedQuery = sanitizeSearchQuery(query);
  
  // Use retry logic for transient failures
  const results = await withRetry(
    () => ytdlp.search(sanitizedQuery, 1),
    { maxRetries: 3, baseDelay: 1000 }
  );
  
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

/**
 * Resolve a track from a direct YouTube URL with validation
 */
export async function resolveTrackFromUrl(url: string, requestedBy: string): Promise<Track> {
  // Validate the URL
  const validatedUrl = validateYouTubeUrl(url);
  
  // Use retry logic for transient failures
  const results = await withRetry(
    () => ytdlp.search(validatedUrl, 1),
    { maxRetries: 3, baseDelay: 1000 }
  );
  
  const first = results[0];

  if (!first) {
    throw new Error("Could not retrieve video information from URL.");
  }

  return {
    title: first.title ?? "Unknown title",
    url: first.url,
    requestedBy,
    duration: first.durationInSec,
  };
}

/**
 * Check if input is a YouTube URL (for routing)
 */
export { isYouTubeUrl };

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

/**
 * Translate technical errors to user-friendly messages
 */
export function translateError(error: unknown): string {
  const message = String(error).toLowerCase();
  
  if (message.includes('no supported javascript runtime')) {
    return '⚠️ Bot configuration error. Contact administrator (Bun runtime not configured).';
  }
  
  if (message.includes('bun (unavailable)')) {
    return '⚠️ Bot configuration error. Contact administrator (Bun version incompatible).';
  }
  
  if (message.includes('403') || message.includes('forbidden')) {
    return '🔒 YouTube is blocking this request. Try again later.';
  }
  
  if (message.includes('429')) {
    return '⏳ YouTube rate limit reached. Please wait a moment before trying again.';
  }
  
  if (message.includes('video unavailable') || message.includes('not found')) {
    return '❌ This video is unavailable, private, or has been deleted.';
  }
  
  if (message.includes('sign in') || message.includes('age verification')) {
    return '🔐 This video requires age verification. Try a different video.';
  }
  
  if (message.includes('copyright') || message.includes('blocked')) {
    return '🚫 This video is blocked due to copyright restrictions.';
  }
  
  if (message.includes('region') || message.includes('country')) {
    return '🌍 This video is not available in your region.';
  }
  
  if (message.includes('timeout')) {
    return '⏱️ Request timed out. Please try again.';
  }
  
  if (message.includes('network') || message.includes('connection')) {
    return '📡 Network error. Please check your connection and try again.';
  }
  
  if (message.includes('no results')) {
    return '🔍 No results found for your search. Try a different query.';
  }
  
  if (message.includes('invalid url') || message.includes('forbidden characters')) {
    return '🔗 Invalid URL or search query provided.';
  }
  
  // Default message
  const errorMessage = error instanceof Error ? error.message : String(error);
  return `❌ An error occurred: ${errorMessage.slice(0, 100)}`;
}
