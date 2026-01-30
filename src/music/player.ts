import * as ytdlp from "./ytdlp";
import type { DiscordGatewayAdapterCreator } from "@discordjs/voice";
import {
  AudioPlayer,
  AudioPlayerStatus,
  NoSubscriberBehavior,
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
import { withRetry } from "../utils/retry";

const IDLE_TIMEOUT_MS = 60_000;
const MAX_PLAYLISTS_PER_GUILD = 10;
const MAX_PLAYLIST_NAME_LENGTH = 50;

export type LoopMode = "off" | "track" | "queue";

export interface PlayerState {
  volume: number;
  loopMode: LoopMode;
  isPlaying: boolean;
  queueSize: number;
}

export interface Playlist {
  name: string;
  tracks: Track[];
  createdAt: Date;
}

export class GuildMusicPlayer {
  private readonly queue = new MusicQueue();
  private readonly player: AudioPlayer;
  private connection?: VoiceConnection;
  private currentTrack?: Track;
  private processing = false;
  private idleTimer?: ReturnType<typeof setTimeout>;
  private reconnectAttempts = 0;
  private readonly maxReconnectAttempts = 5;
  private reconnectTimer?: ReturnType<typeof setTimeout>;
  
  // Features
  private volume = 1.0; // 0.0 to 2.0 (0% to 200%)
  private loopMode: LoopMode = "off";
  private retryCount = 0;
  private readonly maxRetries = 3;
  private playlists = new Map<string, Track[]>();
  private autoplayEnabled = false;
  
  // Pre-buffering for gapless playback
  private prebufferedStream?: { track: Track; stream: ytdlp.StreamResult };

  constructor(private readonly logger: Logger, private readonly guildId: string) {
    this.player = createAudioPlayer({
      behaviors: {
        noSubscriber: NoSubscriberBehavior.Pause,
        maxMissedFrames: 5,  // Limit missed frames for faster error recovery
      },
    });

    this.player.on(AudioPlayerStatus.Idle, () => {
      this.handleTrackEnd().catch((error) => {
        this.logger.error(`Failed advancing queue for guild ${this.guildId}: ${(error as Error).message}`);
      });
    });

    this.player.on("error", (error) => {
      this.logger.error(`Audio player error in guild ${this.guildId}: ${error.message}`);
      this.handlePlaybackError(error);
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

  get state(): PlayerState {
    return {
      volume: Math.round(this.volume * 100),
      loopMode: this.loopMode,
      isPlaying: this.player.state.status === AudioPlayerStatus.Playing,
      queueSize: this.queue.size(),
    };
  }

  getAutoplay(): boolean {
    return this.autoplayEnabled;
  }

  setAutoplay(enabled: boolean): boolean {
    this.autoplayEnabled = enabled;
    return this.autoplayEnabled;
  }

  async enqueue(track: Track, channel: VoiceBasedChannel): Promise<number> {
    await this.ensureConnection(channel);
    const position = this.queue.enqueue(track);

    if (this.player.state.status === AudioPlayerStatus.Idle && !this.processing) {
      // Don't await - let streaming start in background so reply is sent immediately
      this.startNext().catch((error) => {
        this.logger.error(`Failed to start playback in guild ${this.guildId}: ${(error as Error).message}`);
      });
    }

    return position;
  }

  async skip(): Promise<void> {
    this.retryCount = 0;
    this.player.stop(true);
  }

  async stop(): Promise<void> {
    this.retryCount = 0;
    this.queue.clear();
    this.currentTrack = undefined;
    this.prebufferedStream = undefined; // Clear prebuffered stream
    this.player.stop(true);
    this.scheduleDisconnect();
  }

  pause(): boolean {
    return this.player.pause(true);
  }

  resume(): boolean {
    return this.player.unpause();
  }

  /**
   * Set volume level
   * @param percentage - Volume percentage (0-200)
   * @returns The actual volume set (0-200)
   */
  setVolume(percentage: number): number {
    // Clamp to 0-200 range
    this.volume = Math.max(0, Math.min(2.0, percentage / 100));
    
    return Math.round(this.volume * 100);
  }

  /**
   * Get current volume as percentage
   */
  getVolume(): number {
    return Math.round(this.volume * 100);
  }

  /**
   * Get volume emoji for display
   */
  getVolumeEmoji(): string {
    const vol = this.volume;
    if (vol === 0) return "🔇";
    if (vol < 0.33) return "🔈";
    if (vol < 0.66) return "🔉";
    return "🔊";
  }

  /**
   * Set loop mode
   * @param mode - Loop mode: 'off', 'track', or 'queue'
   */
  setLoopMode(mode: LoopMode): LoopMode {
    this.loopMode = mode;
    return this.loopMode;
  }

  /**
   * Get current loop mode
   */
  getLoopMode(): LoopMode {
    return this.loopMode;
  }

  /**
   * Remove track from queue at position
   * @param position - 1-based position in queue
   */
  removeFromQueue(position: number): Track | undefined {
    return this.queue.removeAt(position - 1);
  }

  /**
   * Move track in queue
   * @param fromPosition - Source position (1-based)
   * @param toPosition - Destination position (1-based)
   */
  moveInQueue(fromPosition: number, toPosition: number): boolean {
    return this.queue.move(fromPosition - 1, toPosition - 1);
  }

  /**
   * Shuffle the queue
   */
  shuffleQueue(): void {
    this.queue.shuffle();
  }

  /**
   * Get track at specific queue position
   * @param position - 1-based position
   */
  getQueueTrack(position: number): Track | undefined {
    return this.queue.get(position - 1);
  }

  // ==================== PLAYLIST MANAGEMENT ====================

  /**
   * Save current queue as a named playlist
   * @param name - Playlist name
   * @returns True if saved successfully
   */
  savePlaylist(name: string): boolean {
    const trimmedName = name.trim();
    
    if (!trimmedName || trimmedName.length > MAX_PLAYLIST_NAME_LENGTH) {
      throw new Error(`Playlist name must be 1-${MAX_PLAYLIST_NAME_LENGTH} characters.`);
    }

    if (this.queue.size() === 0 && !this.currentTrack) {
      throw new Error("Cannot save empty playlist. Queue something first!");
    }

    if (this.playlists.size >= MAX_PLAYLISTS_PER_GUILD && !this.playlists.has(trimmedName)) {
      throw new Error(`Maximum ${MAX_PLAYLISTS_PER_GUILD} playlists allowed. Delete one first.`);
    }

    // Save current queue + now playing
    const tracks: Track[] = [];
    if (this.currentTrack) {
      tracks.push(this.currentTrack);
    }
    tracks.push(...this.queue.toArray());

    this.playlists.set(trimmedName, tracks);
    return true;
  }

  /**
   * Load a playlist to the queue
   * @param name - Playlist name
   * @param append - If true, append to current queue; if false, replace
   * @returns Number of tracks loaded
   */
  loadPlaylist(name: string, append = false): number {
    const trimmedName = name.trim();
    const tracks = this.playlists.get(trimmedName);

    if (!tracks) {
      throw new Error(`Playlist "${trimmedName}" not found.`);
    }

    if (!append) {
      this.queue.clear();
    }

    for (const track of tracks) {
      this.queue.enqueue(track);
    }

    return tracks.length;
  }

  /**
   * Delete a saved playlist
   * @param name - Playlist name
   * @returns True if deleted
   */
  deletePlaylist(name: string): boolean {
    const trimmedName = name.trim();
    return this.playlists.delete(trimmedName);
  }

  /**
   * List all saved playlists
   * @returns Array of playlist names and track counts
   */
  listPlaylists(): { name: string; trackCount: number }[] {
    return Array.from(this.playlists.entries()).map(([name, tracks]) => ({
      name,
      trackCount: tracks.length,
    }));
  }

  /**
   * Check if a playlist exists
   */
  hasPlaylist(name: string): boolean {
    return this.playlists.has(name.trim());
  }

  // ==================== VOICE CONNECTION ====================

  async prepare(channel: VoiceBasedChannel): Promise<void> {
    this.logger.info(`[Player] Preparing connection for guild ${this.guildId}`);
    await this.ensureConnection(channel);
  }

  /**
   * Clear the player and free resources
   */
  destroy(): void {
    this.stop();
    this.destroyConnection();
    this.clearReconnectTimer();
  }

  private async handleTrackEnd(): Promise<void> {
    if (this.loopMode === "track" && this.currentTrack) {
      // Re-enqueue current track at front
      this.queue.unshift(this.currentTrack);
    } else if (this.loopMode === "queue" && this.currentTrack) {
      // Move finished track to end for continuous playback
      this.queue.enqueue(this.currentTrack);
    }
    
    await this.startNext();
  }

  private handlePlaybackError(error: Error & { resource?: { metadata?: unknown } }): void {
    // Enhanced error logging with metadata if available
    const metadata = error.resource?.metadata as { title?: string; url?: string } | undefined;
    const resourceInfo = metadata?.title 
      ? ` | Track: "${metadata.title}"` 
      : '';
    this.logger.error(`Playback error in guild ${this.guildId}${resourceInfo}: ${error.message}`);
    
    if (this.retryCount < this.maxRetries) {
      this.retryCount++;
      const delay = Math.pow(2, this.retryCount) * 1000;
      this.logger.info(`Retrying playback in ${delay}ms (attempt ${this.retryCount}/${this.maxRetries})`);
      
      setTimeout(() => {
        this.startNext().catch((err) => {
          this.logger.error(`Failed to recover after retry: ${err.message}`);
        });
      }, delay);
    } else {
      this.logger.warn(`Max retries exceeded, skipping to next track`);
      this.retryCount = 0;
      this.startNext().catch((err) => {
        this.logger.error(`Failed to advance after max retries: ${err.message}`);
      });
    }
  }

  private async ensureConnection(channel: VoiceBasedChannel): Promise<VoiceConnection> {
    if (
      this.connection &&
      this.connection.joinConfig.channelId === channel.id &&
      this.connection.state.status !== VoiceConnectionStatus.Destroyed
    ) {
      this.logger.info(`[Player] Using existing connection`);
      return this.connection;
    }

    this.destroyConnection();
    this.clearReconnectTimer();

    this.logger.info(`[Player] Joining voice channel ${channel.id}`);
    this.connection = joinVoiceChannel({
      channelId: channel.id,
      guildId: channel.guild.id,
      adapterCreator: channel.guild.voiceAdapterCreator as DiscordGatewayAdapterCreator,
      selfDeaf: true,
    });

    this.setupConnectionHandlers();

    this.connection.subscribe(this.player);
    this.logger.info(`[Player] Waiting for connection ready state...`);
    await entersState(this.connection, VoiceConnectionStatus.Ready, 20_000);
    this.logger.info(`[Player] Connection ready`);
    this.reconnectAttempts = 0;
    return this.connection;
  }

  private setupConnectionHandlers(): void {
    if (!this.connection) return;

    this.connection.on("stateChange", (oldState, newState) => {
      this.logger.info(`[Player] Connection state: ${oldState.status} -> ${newState.status}`);
      
      if (newState.status === VoiceConnectionStatus.Disconnected) {
        this.handleDisconnection();
      } else if (newState.status === VoiceConnectionStatus.Destroyed) {
        this.destroyConnection();
        this.clearReconnectTimer();
      } else if (newState.status === VoiceConnectionStatus.Ready) {
        // Reset reconnect attempts on successful connection
        this.reconnectAttempts = 0;
        this.clearReconnectTimer();
      }
    });
  }

  private handleDisconnection(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.logger.error(`[Player] Max reconnection attempts (${this.maxReconnectAttempts}) reached. Giving up.`);
      this.destroyConnection();
      return;
    }

    this.reconnectAttempts++;
    const delay = this.getReconnectDelay();
    
    this.logger.warn(
      `[Player] Voice disconnected in guild ${this.guildId}. ` +
      `Attempting reconnection ${this.reconnectAttempts}/${this.maxReconnectAttempts} in ${delay}ms...`
    );

    this.clearReconnectTimer();
    this.reconnectTimer = setTimeout(async () => {
      if (!this.connection) return;

      try {
        // Try to reconnect by re-entering ready state
        await entersState(this.connection, VoiceConnectionStatus.Ready, 30_000);
        this.logger.info(`[Player] Successfully reconnected!`);
        this.reconnectAttempts = 0;
      } catch {
        // Reconnection failed, will trigger another state change
        this.logger.warn(`[Player] Reconnection attempt ${this.reconnectAttempts} failed.`);
      }
    }, delay);
  }

  private getReconnectDelay(): number {
    // Exponential backoff: 1s, 2s, 5s, 10s, 30s
    const delays = [1000, 2000, 5000, 10000, 30000];
    const index = Math.max(0, Math.min(this.reconnectAttempts - 1, delays.length - 1));
    return delays[index]!;
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }
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
      
      // Try autoplay if enabled
      if (this.autoplayEnabled && this.currentTrack) {
        this.logger.info(`[Autoplay] Attempting to find related content...`);
        // Autoplay logic would go here - requires additional implementation
      }
      
      this.scheduleDisconnect();
      this.processing = false;
      return;
    }

    try {
      // Use prebuffered stream if available for this track, otherwise create new
      const stream = this.prebufferedStream?.track.url === next.url 
        ? this.prebufferedStream.stream 
        : await this.createStream(next);
      
      // Clear prebuffered stream as we're using it now
      this.prebufferedStream = undefined;
      
      // Create resource with metadata for better error tracking
      // Per Discord.js docs: metadata helps identify resources in error handlers
      // Note: inlineVolume disabled to prevent timing issues (VolumeTransformer can cause latency)
      const resource = createAudioResource(stream.stream, {
        inputType: stream.type,
        inlineVolume: false,  // Disabled to prevent TimeoutNegativeWarning
        metadata: {
          title: next.title,
          url: next.url,
          guildId: this.guildId,
        },
      });

      this.player.play(resource);
      this.currentTrack = next;
      this.retryCount = 0; // Reset retry count on success
      
      // Prebuffer next track for gapless playback
      this.triggerPrebuffer();
    } catch (error) {
      this.logger.error(`Failed to start track "${next.title}" in guild ${this.guildId}: ${(error as Error).message}`);
      // Clear prebuffered stream on error
      this.prebufferedStream = undefined;
      // Skip to next track on failure
      this.processing = false;
      await this.startNext();
      return;
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
    this.clearReconnectTimer();
    this.currentTrack = undefined;
    
    // Only destroy if connection exists and isn't already destroyed
    if (this.connection && this.connection.state.status !== VoiceConnectionStatus.Destroyed) {
      this.connection.destroy();
    }
    
    this.connection = undefined;
    this.player.stop(true);
  }

  private async createStream(track: Track) {
    try {
      // Use retry logic for transient failures
      const stream = await withRetry(
        () => ytdlp.createStream(track.url),
        { maxRetries: 2, baseDelay: 1000 }
      );
      
      this.logger.info(`Starting stream for "${track.title}" in guild ${this.guildId}`);
      return stream;
    } catch (error) {
      this.logger.error(
        `Failed to create stream for "${track.title}" in guild ${this.guildId}: ${(error as Error).message}`,
      );
      throw error;
    }
  }

  /**
   * Prebuffer the next track for gapless playback.
   * Starts extracting the stream URL in the background while current track plays.
   */
  private triggerPrebuffer(): void {
    const nextTrack = this.queue.peek();
    if (!nextTrack) return;

    // Don't prebuffer if already prebuffered
    if (this.prebufferedStream?.track.url === nextTrack.url) return;

    this.logger.info(`[Prebuffer] Starting background extraction for: ${nextTrack.title}`);

    // Start prebuffering in background (don't await)
    this.createStream(nextTrack)
      .then(stream => {
        this.prebufferedStream = { track: nextTrack, stream };
        this.logger.info(`[Prebuffer] Successfully prebuffered: ${nextTrack.title}`);
      })
      .catch(error => {
        this.logger.warn(`[Prebuffer] Failed to prebuffer "${nextTrack.title}": ${(error as Error).message}`);
        this.prebufferedStream = undefined;
      });
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

  /**
   * Remove and cleanup a guild player
   */
  remove(guildId: string): boolean {
    const controller = this.controllers.get(guildId);
    if (controller) {
      controller.destroy();
      return this.controllers.delete(guildId);
    }
    return false;
  }

  /**
   * Get all active guild IDs
   */
  getActiveGuilds(): string[] {
    return Array.from(this.controllers.keys());
  }
}
