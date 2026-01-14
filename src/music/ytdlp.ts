import playdl, { YouTubeVideo } from 'play-dl';
import { spawn } from 'child_process';
import { existsSync } from 'fs';
import { Readable } from 'stream';
import { StreamType } from '@discordjs/voice';
import path from 'path';

// Path to yt-dlp binary for streaming (signature decryption works reliably)
const YTDLP_PATH = path.resolve(process.cwd(), 'yt-dlp');

// Path to cookies file - can be overridden via YOUTUBE_COOKIES_PATH env var
const COOKIES_PATH = process.env.YOUTUBE_COOKIES_PATH 
    ? path.resolve(process.env.YOUTUBE_COOKIES_PATH)
    : path.resolve(process.cwd(), 'cookies.txt');

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
 * Search YouTube for videos matching the query, or get info for a direct URL.
 * Uses play-dl which is ~10x faster than yt-dlp (no process spawning).
 * 
 * Typical times:
 * - play-dl search: ~500ms
 * - yt-dlp search: ~5000ms
 */
export async function search(query: string): Promise<VideoDetails[]> {
    try {
        // Check if it's a YouTube URL
        if (playdl.yt_validate(query) === 'video') {
            const info = await playdl.video_info(query);
            return [{
                title: info.video_details.title ?? 'Unknown title',
                url: info.video_details.url,
                durationInSec: info.video_details.durationInSec ?? 0
            }];
        }

        // Search YouTube
        const results = await playdl.search(query, { 
            limit: 1,
            source: { youtube: 'video' }
        });

        if (results.length === 0) {
            return [];
        }

        const video = results[0] as YouTubeVideo;
        return [{
            title: video.title ?? 'Unknown title',
            url: video.url,
            durationInSec: video.durationInSec ?? 0
        }];
    } catch (error) {
        console.error(`[play-dl] Search failed for "${query}":`, error);
        return [];
    }
}

/**
 * Create an audio stream from a YouTube URL.
 * Uses yt-dlp for reliable signature decryption and streaming.
 * 
 * Note: We use yt-dlp here because pure JS libraries (play-dl, youtubei.js)
 * currently have issues with YouTube's SABR streaming changes.
 */
export async function createStream(url: string): Promise<StreamResult> {
    return new Promise((resolve, reject) => {
        const args = [
            '-f', 'bestaudio/best',
            '-q', '--no-warnings',
            '--buffer-size', '16K',
            '-o', '-',
        ];

        // Add cookies if file exists (required for YouTube bot detection bypass)
        if (existsSync(COOKIES_PATH)) {
            args.push('--cookies', COOKIES_PATH);
            console.log(`[yt-dlp] Using cookies from: ${COOKIES_PATH}`);
        } else {
            console.warn(`[yt-dlp] Warning: No cookies file found at ${COOKIES_PATH}. YouTube may block requests.`);
        }

        args.push(url);

        console.log(`[yt-dlp] Creating stream for: ${url}`);
        
        const process = spawn(YTDLP_PATH, args, {
            stdio: ['ignore', 'pipe', 'pipe']
        });

        let hasResolved = false;

        process.on('error', (err) => {
            console.error(`[yt-dlp] Failed to spawn: ${err.message}`);
            if (!hasResolved) {
                hasResolved = true;
                reject(new Error(`Failed to spawn yt-dlp: ${err.message}`));
            }
        });

        process.stderr?.on('data', (data) => {
            const msg = data.toString();
            if (msg.includes('ERROR')) {
                console.error(`[yt-dlp] ${msg}`);
            }
        });

        // Wait for first data to confirm stream is working
        process.stdout?.once('data', () => {
            if (!hasResolved) {
                hasResolved = true;
                resolve({
                    stream: process.stdout!,
                    type: StreamType.Arbitrary
                });
            }
        });

        // Handle case where stream closes without data
        process.on('close', (code) => {
            if (!hasResolved) {
                hasResolved = true;
                reject(new Error(`yt-dlp exited with code ${code} without producing audio`));
            }
        });

        // Timeout after 15 seconds
        setTimeout(() => {
            if (!hasResolved) {
                hasResolved = true;
                process.kill();
                reject(new Error('Timeout waiting for audio stream'));
            }
        }, 15000);
    });
}
