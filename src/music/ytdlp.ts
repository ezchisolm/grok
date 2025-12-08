import { spawn } from 'child_process';
import { Readable } from 'stream';
import { StreamType } from '@discordjs/voice';
import path from 'path';
import fs from 'fs';

const YTDLP_PATH = path.resolve(process.cwd(), 'yt-dlp');
const COOKIES_PATH = path.resolve(process.cwd(), 'cookies.txt');



export interface VideoDetails {
    title: string;
    url: string;
    durationInSec: number;
}

export async function getVideoInfo(url: string): Promise<VideoDetails> {
    return new Promise((resolve, reject) => {
        const args = ['--dump-json'];
        
        // Add cookies if available (use web client for better compatibility)
        if (fs.existsSync(COOKIES_PATH)) {
            args.push('--cookies', COOKIES_PATH);
            args.push('--extractor-args', 'youtube:js_runtime=bun');
        } else {
            // Without cookies, use android_music client to avoid bot detection
            args.push('--extractor-args', 'youtube:player_client=android_music;js_runtime=bun');
        }
        
        args.push(url);
        
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
                    resolve({
                        title: info.title,
                        url: info.webpage_url,
                        durationInSec: info.duration
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

export function createStream(url: string): { stream: Readable; type: StreamType } {
    // -f bestaudio: download best audio quality
    // -o -: output to stdout
    // -q: quiet (no progress bar)
    // --no-warnings: suppress warnings
    // --buffer-size 16K: minimize buffer in yt-dlp to stream faster
    const args = [
        '-f', 'bestaudio',
        '-q', '--no-warnings',
        '--buffer-size', '16K'
    ];

    if (fs.existsSync(COOKIES_PATH)) {
        args.push('--cookies', COOKIES_PATH);
        args.push('--extractor-args', 'youtube:js_runtime=bun');
    } else {
        args.push('--extractor-args', 'youtube:player_client=android_music;js_runtime=bun');
    }
    
    args.push('-o', '-', url);

    const process = spawn(YTDLP_PATH, args, {
        stdio: ['ignore', 'pipe', 'ignore']
    });

    
    process.on('error', (err) => {
        console.error(`[yt-dlp] Failed to spawn process for stream: ${err.message}`);
    });

    if (!process.stdout) {

        throw new Error('Failed to create stdout stream');
    }

    return {
        stream: process.stdout,
        type: StreamType.Arbitrary
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
        const args = ['--dump-json'];
        
        if (fs.existsSync(COOKIES_PATH)) {
            args.push('--cookies', COOKIES_PATH);
            args.push('--extractor-args', 'youtube:js_runtime=bun');
        } else {
            args.push('--extractor-args', 'youtube:player_client=android_music;js_runtime=bun');
        }
        
        args.push(`ytsearch1:${query}`);

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
                    resolve([{
                        title: info.title,
                        url: info.webpage_url,
                        durationInSec: info.duration
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
