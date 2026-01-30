// Input validation utilities for Discord bot

const ALLOWED_YOUTUBE_HOSTS = [
  'www.youtube.com',
  'youtube.com',
  'youtu.be',
  'music.youtube.com',
];

const SHELL_METACHARACTERS = /[;|&$`\\]/;

const MAX_QUERY_LENGTH = 200;

/**
 * Validates if a string is a valid YouTube URL
 * 
 * @param input - The string to validate
 * @returns True if it's a valid YouTube URL
 */
export function isYouTubeUrl(input: string): boolean {
  try {
    const url = new URL(input);
    return ALLOWED_YOUTUBE_HOSTS.includes(url.hostname);
  } catch {
    return false;
  }
}

/**
 * Validates and sanitizes a YouTube URL
 * 
 * @param url - The URL to validate
 * @returns The validated URL
 * @throws Error if URL is invalid or contains dangerous characters
 */
export function validateYouTubeUrl(url: string): string {
  // Check length
  if (url.length > MAX_QUERY_LENGTH) {
    throw new Error(`URL too long. Maximum length is ${MAX_QUERY_LENGTH} characters.`);
  }
  
  // Check for shell metacharacters (prevents command injection)
  if (SHELL_METACHARACTERS.test(url)) {
    throw new Error('Invalid URL: Contains forbidden characters.');
  }
  
  // Validate it's a proper URL
  try {
    const parsed = new URL(url);
    
    // Check hostname
    if (!ALLOWED_YOUTUBE_HOSTS.includes(parsed.hostname)) {
      throw new Error(`Invalid URL: ${parsed.hostname} is not a valid YouTube domain.`);
    }
    
    // Basic protocol check
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      throw new Error('Invalid URL: Only HTTP/HTTPS protocols are allowed.');
    }
    
    return url;
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Invalid URL')) {
      throw error;
    }
    throw new Error('Invalid URL format.');
  }
}

/**
 * Sanitizes a search query to prevent injection attacks
 * 
 * @param query - The search query
 * @returns Sanitized query
 * @throws Error if query contains dangerous characters or is invalid
 */
export function sanitizeSearchQuery(query: string): string {
  // Check length
  if (query.length > MAX_QUERY_LENGTH) {
    throw new Error(`Search query too long. Maximum length is ${MAX_QUERY_LENGTH} characters.`);
  }
  
  if (query.length === 0) {
    throw new Error('Search query cannot be empty.');
  }
  
  // Check for shell metacharacters
  if (SHELL_METACHARACTERS.test(query)) {
    throw new Error('Search query contains forbidden characters.');
  }
  
  // Trim whitespace
  const sanitized = query.trim();
  
  if (sanitized.length === 0) {
    throw new Error('Search query cannot be empty or only whitespace.');
  }
  
  return sanitized;
}

/**
 * Validates a Discord guild ID format
 * 
 * @param guildId - The guild ID to validate
 * @returns True if valid format
 */
export function isValidGuildId(guildId: string): boolean {
  return /^\d{17,19}$/.test(guildId);
}

/**
 * Validates a Discord channel ID format
 * 
 * @param channelId - The channel ID to validate
 * @returns True if valid format
 */
export function isValidChannelId(channelId: string): boolean {
  return /^\d{17,19}$/.test(channelId);
}

/**
 * Validates volume level
 * 
 * @param volume - Volume level (0-200)
 * @returns Validated volume (clamped to 0-200)
 * @throws Error if volume is not a number
 */
export function validateVolume(volume: number): number {
  if (typeof volume !== 'number' || isNaN(volume)) {
    throw new Error('Volume must be a number.');
  }
  
  // Clamp to 0-200 range
  return Math.max(0, Math.min(200, volume));
}

/**
 * Validates queue position
 * 
 * @param position - The position (1-based)
 * @param queueSize - Current queue size
 * @returns Validated position (0-based index)
 * @throws Error if position is invalid
 */
export function validateQueuePosition(position: number, queueSize: number): number {
  if (typeof position !== 'number' || isNaN(position)) {
    throw new Error('Position must be a number.');
  }
  
  if (position < 1) {
    throw new Error('Position must be at least 1.');
  }
  
  if (position > queueSize) {
    throw new Error(`Position ${position} exceeds queue size (${queueSize}).`);
  }
  
  // Convert to 0-based index
  return position - 1;
}
