import playdl from "play-dl";
import type { DiscordGatewayAdapterCreator } from "@discordjs/voice";
import {
  AudioPlayer,
  AudioPlayerStatus,
  NoSubscriberBehavior,
  StreamType,
  VoiceConnection,
  VoiceConnectionStatus,
  createAudioPlayer,
  createAudioResource,
  entersState,
  joinVoiceChannel,
} from "@discordjs/voice";
import type { VoiceBasedChannel } from "discord.js";
import { MusicQueue, type Track } from "./queue";
import type { Logger } from "../utils/logger";

const IDLE_TIMEOUT_MS = 60_000;

export class GuildMusicPlayer {
  private readonly queue = new MusicQueue();
  private readonly player: AudioPlayer;
  private connection?: VoiceConnection;
  private currentTrack?: Track;
  private processing = false;
  private idleTimer?: ReturnType<typeof setTimeout>;

  constructor(private readonly logger: Logger, private readonly guildId: string) {
    this.player = createAudioPlayer({
      behaviors: {
        noSubscriber: NoSubscriberBehavior.Pause,
      },
    });

    this.player.on(AudioPlayerStatus.Idle, () => {
      this.startNext().catch((error) => {
        this.logger.error(`Failed advancing queue for guild ${this.guildId}: ${(error as Error).message}`);
      });
    });

    this.player.on("error", (error) => {
      this.logger.error(`Audio player error in guild ${this.guildId}: ${error.message}`);
      this.startNext().catch((err) => {
        this.logger.error(`Failed to recover after audio error in guild ${this.guildId}: ${(err as Error).message}`);
      });
    });
  }

  get nowPlaying(): Track | undefined {
    return this.currentTrack;
  }

  get queueItems(): Track[] {
    return this.queue.toArray();
  }

  get status(): AudioPlayerStatus {
    return this.player.state.status;
  }

  async enqueue(track: Track, channel: VoiceBasedChannel): Promise<number> {
    await this.ensureConnection(channel);
    const position = this.queue.enqueue(track);

    if (this.player.state.status === AudioPlayerStatus.Idle && !this.processing) {
      await this.startNext();
    }

    return position;
  }

  async skip(): Promise<void> {
    this.player.stop(true);
  }

  async stop(): Promise<void> {
    this.queue.clear();
    this.currentTrack = undefined;
    this.player.stop(true);
    this.scheduleDisconnect();
  }

  pause(): boolean {
    return this.player.pause(true);
  }

  resume(): boolean {
    return this.player.unpause();
  }

  private async ensureConnection(channel: VoiceBasedChannel): Promise<VoiceConnection> {
    if (
      this.connection &&
      this.connection.joinConfig.channelId === channel.id &&
      this.connection.state.status !== VoiceConnectionStatus.Destroyed
    ) {
      return this.connection;
    }

    this.destroyConnection();

    this.connection = joinVoiceChannel({
      channelId: channel.id,
      guildId: channel.guild.id,
      adapterCreator: channel.guild.voiceAdapterCreator as DiscordGatewayAdapterCreator,
      selfDeaf: true,
    });

    this.connection.on("stateChange", (_, newState) => {
      if (newState.status === VoiceConnectionStatus.Disconnected || newState.status === VoiceConnectionStatus.Destroyed) {
        this.logger.warn(`Voice connection lost in guild ${this.guildId}; cleaning up.`);
        this.destroyConnection();
      }
    });

    this.connection.subscribe(this.player);
    await entersState(this.connection, VoiceConnectionStatus.Ready, 20_000);
    return this.connection;
  }

  private async startNext(): Promise<void> {
    if (this.processing) {
      return;
    }

    this.processing = true;
    this.clearIdleTimer();

    const next = this.queue.shift();

    if (!next) {
      this.currentTrack = undefined;
      this.scheduleDisconnect();
      this.processing = false;
      return;
    }

    try {
      const stream = await this.createStream(next.url);
      const resource = createAudioResource(stream.stream, {
        inputType: stream.type,
      });

      this.player.play(resource);
      this.currentTrack = next;
    } catch (error) {
      this.logger.error(`Failed to start track "${next.title}" in guild ${this.guildId}: ${(error as Error).message}`);
      await this.startNext();
    } finally {
      this.processing = false;
    }
  }

  private scheduleDisconnect() {
    this.clearIdleTimer();
    this.idleTimer = setTimeout(() => {
      this.destroyConnection();
    }, IDLE_TIMEOUT_MS);
  }

  private clearIdleTimer() {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = undefined;
    }
  }

  private destroyConnection() {
    this.clearIdleTimer();
    this.currentTrack = undefined;
    this.connection?.destroy();
    this.connection = undefined;
    this.player.stop(true);
  }

  private async createStream(url: string) {
    try {
      // Get video info first, then create stream from info
      // This is more reliable than direct streaming
      const info = await playdl.video_info(url);
      const stream = await playdl.stream_from_info(info, {
        quality: 1,
      });
      
      this.logger.info(`Successfully created stream for "${info.video_details.title}" in guild ${this.guildId}`);
      return stream;
    } catch (error) {
      this.logger.error(
        `Failed to create stream for url ${url} in guild ${this.guildId}: ${(error as Error).message}`,
      );
      throw error;
    }
  }

  private extractVideoId(url: string): string | null {
    // Extract video ID from various YouTube URL formats
    const patterns = [
      /(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\n?#]+)/,
      /youtube\.com\/embed\/([^&\n?#]+)/,
      /youtube\.com\/v\/([^&\n?#]+)/,
    ];

    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match && match[1]) {
        return match[1];
      }
    }

    return null;
  }
}

export class MusicManager {
  private readonly controllers = new Map<string, GuildMusicPlayer>();

  constructor(private readonly logger: Logger) {}

  get(guildId: string): GuildMusicPlayer {
    const existing = this.controllers.get(guildId);
    if (existing) {
      return existing;
    }

    const controller = new GuildMusicPlayer(this.logger, guildId);
    this.controllers.set(guildId, controller);
    return controller;
  }
}
