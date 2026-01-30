import { existsSync } from 'fs';
import { StreamType } from '@discordjs/voice';
import path from 'path';
import { globalProcessManager } from '../utils/process-manager';
import { spawn, type ChildProcess } from 'child_process';

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
        
        const proc = spawn(YTDLP_PATH, args, {
            stdio: ['ignore', 'pipe', 'pipe']
        });

        // Track the process
        const command = `yt-dlp search "${query.substring(0, 30)}..."`;
        const tracked = globalProcessManager.track(proc, command, 30000);

        try {
            const [stdout, stderr] = await Promise.all([
                new Promise<string>((resolve, reject) => {
                    let data = '';
                    proc.stdout!.on('data', (chunk) => data += chunk);
                    proc.stdout!.on('end', () => resolve(data));
                    proc.stdout!.on('error', reject);
                }),
                new Promise<string>((resolve) => {
                    let data = '';
                    proc.stderr!.on('data', (chunk) => data += chunk);
                    proc.stderr!.on('end', () => resolve(data));
                    proc.stderr!.on('error', () => resolve(''));
                })
            ]);

            const exitCode = await new Promise<number>((resolve) => {
                proc.on('exit', (code) => resolve(code ?? 1));
            });
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

    const proc = spawn(YTDLP_PATH, args, {
        stdio: ['ignore', 'pipe', 'pipe']
    });

    const command = `yt-dlp extract-url "${url.substring(0, 50)}..."`;
    const tracked = globalProcessManager.track(proc, command, 30000);

    try {
        const [stdout, stderr] = await Promise.all([
            new Promise<string>((resolve, reject) => {
                let data = '';
                proc.stdout!.on('data', (chunk) => data += chunk);
                proc.stdout!.on('end', () => resolve(data));
                proc.stdout!.on('error', reject);
            }),
            new Promise<string>((resolve) => {
                let data = '';
                proc.stderr!.on('data', (chunk) => data += chunk);
                proc.stderr!.on('end', () => resolve(data));
                proc.stderr!.on('error', () => resolve(''));
            })
        ]);

        const exitCode = await new Promise<number>((resolve) => {
            proc.on('exit', (code) => resolve(code ?? 1));
        });
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
 * 
 * OPTIMIZATION: Uses direct WebM/Opus stream without FFmpeg transcoding.
 * YouTube serves audio in WebM container with Opus codec, which is exactly
 * what Discord needs. Transcoding would waste CPU for no benefit.
 * 
 * Per Discord.js docs: Use StreamType.WebmOpus for WebM/Opus streams.
 */
export async function createStream(url: string): Promise<StreamResult> {
    return new Promise((resolve, reject) => {
        // yt-dlp args: output WebM/Opus directly (no transcoding needed)
        const ytdlpArgs = [
            ...YTDLP_BASE_ARGS,
            '--format', 'bestaudio[ext=webm]/bestaudio[ext=m4a]/bestaudio/best',
            '-q',
            '--buffer-size', '32K',
            '-o', '-',
        ];

        // Add cookies if file exists
        if (existsSync(COOKIES_PATH)) {
            ytdlpArgs.push('--cookies', COOKIES_PATH);
            log(`Using cookies from: ${COOKIES_PATH}`);
        }

        ytdlpArgs.push(url);

        log(`Creating WebM/Opus stream for: ${url}`);
        
        const proc = spawn(YTDLP_PATH, ytdlpArgs, {
            stdio: ['ignore', 'pipe', 'pipe']
        }) as ChildProcess;

        // Track the process
        const command = `yt-dlp stream "${url.substring(0, 50)}..."`;
        const tracked = globalProcessManager.track(proc, command, 60000);

        let hasResolved = false;
        let stderr = '';

        // Collect stderr for error handling
        proc.stderr!.on('data', (data: Buffer) => {
            const chunk = data.toString();
            stderr += chunk;
            if (DEBUG) {
                process.stderr.write(chunk);
            }
        });

        proc.on('error', (err: Error) => {
            if (!hasResolved) {
                hasResolved = true;
                globalProcessManager.remove(tracked);
                reject(new Error(`Failed to spawn yt-dlp: ${err.message}`));
            }
        });

        proc.on('exit', (exitCode: number | null) => {
            if (!hasResolved && exitCode !== 0 && exitCode !== null) {
                hasResolved = true;
                globalProcessManager.remove(tracked);
                try {
                    handleYtDlpError(stderr, exitCode);
                } catch (error) {
                    reject(error);
                }
            }
        });

        // Use stdout directly as the audio stream
        // WebM/Opus format is natively supported by Discord
        proc.stdout!.once('data', () => {
            if (!hasResolved) {
                hasResolved = true;
                log(`WebM/Opus stream started successfully`);
                resolve({
                    stream: proc.stdout!,
                    type: StreamType.WebmOpus  // Direct WebM/Opus - no transcoding needed
                });
            }
        });

        proc.stdout!.on('error', (err: Error) => {
            if (!hasResolved) {
                hasResolved = true;
                proc.kill();
                globalProcessManager.remove(tracked);
                reject(new Error(`Stream error: ${err.message}`));
            }
        });

        // Cleanup tracking when stream ends
        proc.stdout!.on('end', () => {
            globalProcessManager.remove(tracked);
        });

        // Timeout after 15 seconds
        setTimeout(() => {
            if (!hasResolved) {
                hasResolved = true;
                proc.kill();
                globalProcessManager.remove(tracked);
                reject(new Error('Timeout waiting for audio stream'));
            }
        }, 15000);
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
