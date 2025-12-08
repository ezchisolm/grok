import { spawn } from 'child_process';
import { Readable } from 'stream';
import { StreamType } from '@discordjs/voice';

export interface VideoDetails {
    title: string;
    url: string;
    durationInSec: number;
}

export async function getVideoInfo(url: string): Promise<VideoDetails> {
    return new Promise((resolve, reject) => {
        const process = spawn('./yt-dlp', ['--dump-json', url]);
        let data = '';
        let errorData = '';

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
    const process = spawn('./yt-dlp', [
        '-f', 'bestaudio',
        '-q', '--no-warnings',
        '--buffer-size', '16K',
        '-o', '-',
        url
    ], {
        stdio: ['ignore', 'pipe', 'ignore']
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
            return [];
        }
    }

    return new Promise((resolve, reject) => {
        const process = spawn('./yt-dlp', ['--dump-json', `ytsearch1:${query}`]);
        let data = '';
        
        process.stdout.on('data', (chunk) => {
            data += chunk;
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
                    resolve([]);
                }
            } else {
                resolve([]);
            }
        });
    });
}
