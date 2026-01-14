import { spawn, execSync } from 'child_process';
import { Readable } from 'stream';
import { StreamType } from '@discordjs/voice';
import path from 'path';
import fs from 'fs';
import ffmpegStatic from 'ffmpeg-static';

const YTDLP_PATH = path.resolve(process.cwd(), 'yt-dlp');
const COOKIES_PATH = path.resolve(process.cwd(), 'cookies.txt');

// Get the full path to Bun
let BUN_PATH = 'bun';
try {
    BUN_PATH = execSync('which bun', { encoding: 'utf-8' }).trim();
    console.log(`[yt-dlp] Found Bun at: ${BUN_PATH}`);
} catch (e) {
    console.warn('[yt-dlp] Could not find Bun path, using "bun" and hoping it\'s in PATH');
}



export interface VideoDetails {
    title: string;
    url: string;
    durationInSec: number;
    streamUrl: string;
}

interface YtDlpFormat {
    url: string;
    vcodec: string;
    acodec: string;
    abr?: number;
    format_id: string;
}

function extractBestAudioUrl(formats: YtDlpFormat[]): string {
    // Filter for audio-only formats (no video codec, has audio codec)
    const audioFormats = formats.filter(
        f => f.vcodec === 'none' && f.acodec && f.acodec !== 'none' && f.url
    );

    if (audioFormats.length === 0) {
        throw new Error('No audio formats available for this video');
    }

    // Sort by audio bitrate (highest first) and pick the best
    audioFormats.sort((a, b) => (b.abr || 0) - (a.abr || 0));
    return audioFormats[0]!.url;
}

export async function getVideoInfo(url: string): Promise<VideoDetails> {
    return new Promise((resolve, reject) => {
        const args = [
            '--dump-json',
            '--js-runtimes', `bun:${BUN_PATH}`
        ];
        
        // Add cookies if available
        if (fs.existsSync(COOKIES_PATH)) {
            args.push('--cookies', COOKIES_PATH);
        } else {
            // Without cookies, use android_music client to avoid some bot detection
            args.push('--extractor-args', 'youtube:player_client=android_music');
        }
        
        args.push(url);
        
        console.log(`[yt-dlp] Running: ${YTDLP_PATH} ${args.join(' ')}`);
        
        const process = spawn(YTDLP_PATH, args);
        let data = '';
        let errorData = '';


        process.on('error', (err) => {
            reject(new Error(`Failed to spawn yt-dlp at ${YTDLP_PATH}: ${err.message}`));
        });

        process.stdout.on('data', (chunk) => {

            data += chunk;
        });

        process.stderr.on('data', (chunk) => {
            errorData += chunk;
        });

        process.on('close', (code) => {
            if (code === 0) {
                try {
                    const info = JSON.parse(data);
                    const streamUrl = extractBestAudioUrl(info.formats || []);
                    resolve({
                        title: info.title,
                        url: info.webpage_url,
                        durationInSec: info.duration,
                        streamUrl
                    });
                } catch (e) {
                    reject(new Error(`Failed to parse yt-dlp output: ${e}`));
                }
            } else {
                reject(new Error(`yt-dlp exited with code ${code}: ${errorData}`));
            }
        });
    });
}

export function createStream(streamUrl: string): { stream: Readable; type: StreamType } {
    // Use FFmpeg directly with the pre-fetched stream URL
    // This avoids spawning yt-dlp again, saving ~10-15 seconds
    const ffmpegPath = ffmpegStatic as unknown as string;
    
    const args = [
        '-reconnect', '1',
        '-reconnect_streamed', '1',
        '-reconnect_delay_max', '5',
        '-i', streamUrl,
        '-analyzeduration', '0',
        '-loglevel', '0',
        '-ar', '48000',
        '-ac', '2',
        '-f', 'opus',
        'pipe:1'
    ];

    const ffmpeg = spawn(ffmpegPath, args, {
        stdio: ['ignore', 'pipe', 'ignore']
    });

    ffmpeg.on('error', (err) => {
        console.error(`[ffmpeg] Failed to spawn process: ${err.message}`);
    });

    if (!ffmpeg.stdout) {
        throw new Error('Failed to create FFmpeg stdout stream');
    }

    return {
        stream: ffmpeg.stdout,
        type: StreamType.OggOpus
    };
}

export async function search(query: string): Promise<VideoDetails[]> {
    // Check if it's a URL
    if (query.startsWith('http')) {
        try {
            const info = await getVideoInfo(query);
            return [info];
        } catch (e) {
            console.error(`[yt-dlp] getVideoInfo failed for URL "${query}":`, e);
            return [];
        }
    }

    return new Promise((resolve, reject) => {
        const args = [
            '--dump-json',
            '--js-runtimes', `bun:${BUN_PATH}`
        ];
        
        if (fs.existsSync(COOKIES_PATH)) {
            args.push('--cookies', COOKIES_PATH);
        } else {
            args.push('--extractor-args', 'youtube:player_client=android_music');
        }
        
        args.push(`ytsearch1:${query}`);

        console.log(`[yt-dlp] Running: ${YTDLP_PATH} ${args.join(' ')}`);

        const process = spawn(YTDLP_PATH, args);
        let data = '';
        let errorData = '';

        
        process.on('error', (err) => {
            console.error(`[yt-dlp] Failed to spawn at ${YTDLP_PATH}:`, err);
            resolve([]);
        });

        process.stdout.on('data', (chunk) => {

            data += chunk;
        });

        process.stderr.on('data', (chunk) => {
            errorData += chunk;
        });

        process.on('close', (code) => {
            if (code === 0) {
                try {
                    const info = JSON.parse(data);
                    const streamUrl = extractBestAudioUrl(info.formats || []);
                    resolve([{
                        title: info.title,
                        url: info.webpage_url,
                        durationInSec: info.duration,
                        streamUrl
                    }]);
                } catch (e) {
                    console.error(`[yt-dlp] JSON parse error for "${query}":`, e);
                    resolve([]);
                }
            } else {
                console.error(`[yt-dlp] Search failed for "${query}". Exit code: ${code}. Error: ${errorData}`);
                resolve([]);
            }
        });
    });
}
