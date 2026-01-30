import { spawn } from 'bun';
import { existsSync } from 'fs';
import { Readable } from 'stream';
import { StreamType } from '@discordjs/voice';
import path from 'path';
import { globalProcessManager } from '../utils/process-manager';

// Debug mode - set DEBUG=ytdlp to enable verbose logging
const DEBUG = process.env.DEBUG === 'ytdlp' || process.env.DEBUG === '*';

// Stream URL cache for faster repeated playback (5-minute TTL)
interface CachedStreamUrl {
    url: string;
    expiresAt: number;
}
const streamUrlCache = new Map<string, CachedStreamUrl>();
const STREAM_URL_TTL_MS = 5 * 60 * 1000; // 5 minutes

function getCachedStreamUrl(videoUrl: string): string | undefined {
    const cached = streamUrlCache.get(videoUrl);
    if (cached && cached.expiresAt > Date.now()) {
        log('Using cached stream URL for:', videoUrl);
        return cached.url;
    }
    if (cached) {
        streamUrlCache.delete(videoUrl); // Expired
    }
    return undefined;
}

function setCachedStreamUrl(videoUrl: string, streamUrl: string): void {
    streamUrlCache.set(videoUrl, {
        url: streamUrl,
        expiresAt: Date.now() + STREAM_URL_TTL_MS,
    });
}

function log(...args: unknown[]) {
  if (DEBUG) {
    console.log('[yt-dlp]', ...args);
  }
}

// Path to yt-dlp binary for streaming (signature decryption works reliably)
const YTDLP_PATH = path.resolve(process.cwd(), 'yt-dlp');

// Path to cookies file - can be overridden via YOUTUBE_COOKIES_PATH env var
const COOKIES_PATH = process.env.YOUTUBE_COOKIES_PATH 
    ? path.resolve(process.env.YOUTUBE_COOKIES_PATH)
    : path.resolve(process.cwd(), 'cookies.txt');

// Base arguments for all yt-dlp operations
// Optimized for fastest playback based on research:
// - Bun runtime for fast JS challenge solving
// - extractor-args for 403 error mitigation  
// - no-playlist to prevent accidental playlist processing
const YTDLP_BASE_ARGS = [
    '--js-runtimes', 'bun',          // Explicitly enable Bun as JavaScript runtime
    // '--no-js-runtimes',            // Uncomment if Deno is installed to force Bun
    '--no-warnings',
    '--no-check-certificates',
    '--retries', '3',
    '--fragment-retries', '3',
    '--socket-timeout', '30',
    '--no-playlist',                 // Prevent playlist URL issues
    '--extractor-args', 'youtube:player_js_version=actual', // Mitigate 403 errors with fresh player version
];

export interface VideoDetails {
    title: string;
    url: string;
    durationInSec: number;
}

export interface StreamResult {
    stream: Readable;
    type: StreamType;
}

/**
 * Validates if a string is a valid YouTube URL
 */
function isYouTubeUrl(input: string): boolean {
    try {
        const url = new URL(input);
        const allowedHosts = ['www.youtube.com', 'youtube.com', 'youtu.be', 'music.youtube.com'];
        return allowedHosts.includes(url.hostname);
    } catch {
        return false;
    }
}

/**
 * Search YouTube for videos matching the query, or get info for a direct URL.
 * Uses yt-dlp with Bun runtime for reliable extraction.
 * 
 * Note: yt-dlp requires Bun >= 1.0.31 for JavaScript runtime support
 */
export async function search(query: string, limit: number = 1): Promise<VideoDetails[]> {
    log(`Searching for: "${query}"`);
    
    try {
        // Determine if it's a direct URL or search query
        const isUrl = isYouTubeUrl(query);
        const searchQuery = isUrl ? query : `ytsearch${limit}:${query}`;
        
        const args = [
            ...YTDLP_BASE_ARGS,
            '--dump-json',
            '--flat-playlist',
            '--playlist-end', limit.toString(),
        ];

        // Add cookies if file exists
        if (existsSync(COOKIES_PATH)) {
            args.push('--cookies', COOKIES_PATH);
            log(`Using cookies from: ${COOKIES_PATH}`);
        }

        args.push(searchQuery);

        log(`Spawning search process`);
        
        const proc = spawn({
            cmd: [YTDLP_PATH, ...args],
            stdout: 'pipe',
            stderr: 'pipe',
            stdin: 'ignore'
        });

        // Track the process
        const command = `yt-dlp search "${query.substring(0, 30)}..."`;
        const tracked = globalProcessManager.track(proc, command, 30000);

        try {
            const [stdout, stderr] = await Promise.all([
                new Response(proc.stdout).text(),
                new Response(proc.stderr).text()
            ]);

            const exitCode = await proc.exited;
            globalProcessManager.remove(tracked);

            if (exitCode !== 0) {
                handleYtDlpError(stderr, exitCode);
            }

            // Parse newline-delimited JSON results
            const results = stdout
                .trim()
                .split('\n')
                .filter(line => line.trim())
                .map(line => {
                    try {
                        return JSON.parse(line);
                    } catch {
                        return null;
                    }
                })
                .filter((data): data is NonNullable<typeof data> => data !== null)
                .map(data => ({
                    title: data.title ?? 'Unknown title',
                    url: data.webpage_url ?? data.url ?? '',
                    durationInSec: data.duration ?? 0
                }))
                .filter(video => video.url); // Filter out entries without URLs

            log(`Search results found: ${results.length}`);
            return results;
        } catch (error) {
            globalProcessManager.kill(tracked, 9);
            throw error;
        }
    } catch (error) {
        console.error(`[yt-dlp] Search failed for "${query}":`, error);
        throw error;
    }
}

/**
 * Extract stream URL from a YouTube video with caching.
 * Uses --print url to get the direct stream URL without downloading.
 */
export async function extractStreamUrl(url: string): Promise<string> {
    // Check cache first
    const cached = getCachedStreamUrl(url);
    if (cached) {
        return cached;
    }

    const args = [
        ...YTDLP_BASE_ARGS,
        '--format', 'bestaudio[ext=webm]/bestaudio/best',
        '--print', 'url',
    ];

    // Add cookies if file exists
    if (existsSync(COOKIES_PATH)) {
        args.push('--cookies', COOKIES_PATH);
    }

    args.push(url);

    log(`Extracting stream URL for: ${url}`);

    const proc = spawn({
        cmd: [YTDLP_PATH, ...args],
        stdout: 'pipe',
        stderr: 'pipe',
        stdin: 'ignore'
    });

    const command = `yt-dlp extract-url "${url.substring(0, 50)}..."`;
    const tracked = globalProcessManager.track(proc, command, 30000);

    try {
        const [stdout, stderr] = await Promise.all([
            new Response(proc.stdout).text(),
            new Response(proc.stderr).text()
        ]);

        const exitCode = await proc.exited;
        globalProcessManager.remove(tracked);

        if (exitCode !== 0) {
            handleYtDlpError(stderr, exitCode);
        }

        const streamUrl = stdout.trim();
        if (!streamUrl || !streamUrl.startsWith('http')) {
            throw new Error('Failed to extract valid stream URL');
        }

        // Cache the URL
        setCachedStreamUrl(url, streamUrl);
        log(`Stream URL extracted and cached for: ${url}`);

        return streamUrl;
    } catch (error) {
        globalProcessManager.kill(tracked, 9);
        throw error;
    }
}

/**
 * Create an audio stream from a YouTube URL.
 * Uses yt-dlp with Bun runtime for reliable signature decryption and streaming.
 */
export async function createStream(url: string): Promise<StreamResult> {
    return new Promise((resolve, reject) => {
        const args = [
            ...YTDLP_BASE_ARGS,
            '--format', 'bestaudio[ext=webm]/bestaudio/best', // Prioritize WebM Opus for direct Discord compatibility
            '-q',
            '--buffer-size', '16K',
            '-o', '-',
        ];

        // Add cookies if file exists
        if (existsSync(COOKIES_PATH)) {
            args.push('--cookies', COOKIES_PATH);
            log(`Using cookies from: ${COOKIES_PATH}`);
        }

        args.push(url);

        log(`Creating stream for: ${url}`);
        
        const proc = spawn({
            cmd: [YTDLP_PATH, ...args],
            stdout: 'pipe',
            stderr: 'pipe',
            stdin: 'ignore'
        });

        // Track the process
        const command = `yt-dlp stream "${url.substring(0, 50)}..."`;
        const tracked = globalProcessManager.track(proc, command, 60000);

        let hasResolved = false;
        let stderr = '';

        // Collect stderr for error handling
        const stderrReader = proc.stderr.getReader();
        const readStderr = async () => {
            try {
                while (true) {
                    const { done, value } = await stderrReader.read();
                    if (done) break;
                    const chunk = new TextDecoder().decode(value);
                    stderr += chunk;
                    if (DEBUG) {
                        process.stderr.write(chunk);
                    }
                }
            } catch {
                // Stderr closed
            }
        };

        // Start reading stderr
        readStderr();

        proc.exited.then((exitCode: number) => {
            if (!hasResolved && exitCode !== 0) {
                hasResolved = true;
                globalProcessManager.remove(tracked);
                try {
                    handleYtDlpError(stderr, exitCode);
                } catch (error) {
                    reject(error);
                }
            }
        }).catch((err: Error) => {
            if (!hasResolved) {
                hasResolved = true;
                globalProcessManager.remove(tracked);
                reject(new Error(`Failed to spawn yt-dlp: ${err.message}`));
            }
        });

        // Wait for first data to confirm stream is working
        // Convert WebStream to Node.js Readable for discord.js compatibility
        const webStream = proc.stdout;
        const nodeStream = webStreamToNodeStream(webStream);
        
        nodeStream.once('data', () => {
            if (!hasResolved) {
                hasResolved = true;
                log(`Stream started successfully`);
                resolve({
                    stream: nodeStream,
                    type: StreamType.WebmOpus  // Direct WebM/Opus streaming - no transcoding needed
                });
            }
        });

        nodeStream.once('error', (err) => {
            if (!hasResolved) {
                hasResolved = true;
                globalProcessManager.kill(tracked, 9);
                reject(new Error(`Stream error: ${err.message}`));
            }
        });

        // Cleanup tracking when stream ends
        nodeStream.once('end', () => {
            globalProcessManager.remove(tracked);
        });

        // Timeout after 15 seconds
        setTimeout(() => {
            if (!hasResolved) {
                hasResolved = true;
                globalProcessManager.kill(tracked, 9);
                reject(new Error('Timeout waiting for audio stream'));
            }
        }, 15000);
    });
}

/**
 * Converts a Web API ReadableStream to a Node.js Readable stream
 * Required for compatibility with @discordjs/voice
 */
function webStreamToNodeStream(webStream: ReadableStream<Uint8Array>): Readable {
    const reader = webStream.getReader();
    
    return new Readable({
        read() {
            reader.read().then(({ done, value }) => {
                if (done) {
                    this.push(null);
                } else {
                    this.push(Buffer.from(value));
                }
            }).catch((err) => {
                this.destroy(err);
            });
        },
        destroy() {
            reader.releaseLock();
            return this;
        }
    });
}

/**
 * Handle yt-dlp errors and translate them to user-friendly messages
 */
function handleYtDlpError(stderr: string, exitCode: number): never {
    console.error(`[yt-dlp] Error (exit code ${exitCode}): ${stderr.slice(0, 500)}`);
    
    if (stderr.includes('No supported JavaScript runtime')) {
        throw new Error(
            'Bun runtime not configured. Ensure Bun >= 1.0.31 is installed and available in PATH.'
        );
    }
    
    if (stderr.includes('bun (unavailable)')) {
        throw new Error(
            'Bun detected but version incompatible. Ensure Bun >= 1.0.31 is installed.'
        );
    }
    
    if (stderr.includes('HTTP Error 403') || stderr.includes('Forbidden')) {
        throw new Error(
            'YouTube is blocking this request (403). The video may be restricted or rate-limited.'
        );
    }
    
    if (stderr.includes('HTTP Error 429')) {
        throw new Error(
            'YouTube rate limit reached (429). Please wait a moment before trying again.'
        );
    }
    
    if (stderr.includes('Video unavailable')) {
        throw new Error(
            'This video is unavailable, private, or has been deleted.'
        );
    }
    
    if (stderr.includes('Sign in to confirm')) {
        throw new Error(
            'This video requires age verification. Try a different video.'
        );
    }
    
    if (stderr.includes('n challenge solving failed')) {
        throw new Error(
            'Unable to decode video signature. YouTube may have changed their protection.'
        );
    }
    
    throw new Error(`yt-dlp failed with code ${exitCode}: ${stderr.slice(0, 200)}`);
}
