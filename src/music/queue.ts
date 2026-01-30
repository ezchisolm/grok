export type Track = {
  title: string;
  url: string;
  requestedBy: string;
  duration?: number;
};

export class MusicQueue {
  private readonly items: Track[] = [];

  enqueue(track: Track): number {
    this.items.push(track);
    return this.items.length;
  }

  /**
   * Add track to the front of the queue (for loop mode)
   */
  unshift(track: Track): number {
    this.items.unshift(track);
    return this.items.length;
  }

  shift(): Track | undefined {
    return this.items.shift();
  }

  peek(): Track | undefined {
    return this.items[0];
  }

  clear() {
    this.items.length = 0;
  }

  isEmpty(): boolean {
    return this.items.length === 0;
  }

  size(): number {
    return this.items.length;
  }

  toArray(): Track[] {
    return [...this.items];
  }

  /**
   * Remove a track at the specified index
   * @param index - 0-based index
   * @returns The removed track or undefined if index is invalid
   */
  removeAt(index: number): Track | undefined {
    if (index < 0 || index >= this.items.length) {
      return undefined;
    }
    const [removed] = this.items.splice(index, 1);
    return removed;
  }

  /**
   * Move a track from one position to another
   * @param fromIndex - Source index (0-based)
   * @param toIndex - Destination index (0-based)
   * @returns True if move was successful
   */
  move(fromIndex: number, toIndex: number): boolean {
    if (fromIndex < 0 || fromIndex >= this.items.length) {
      return false;
    }
    if (toIndex < 0 || toIndex >= this.items.length) {
      return false;
    }
    if (fromIndex === toIndex) {
      return true;
    }

    const track = this.items.splice(fromIndex, 1)[0]!;
    this.items.splice(toIndex, 0, track);
    return true;
  }

  /**
   * Shuffle the queue using Fisher-Yates algorithm
   */
  shuffle(): void {
    for (let i = this.items.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const temp = this.items[i]!;
      this.items[i] = this.items[j]!;
      this.items[j] = temp;
    }
  }

  /**
   * Get track at specific index
   * @param index - 0-based index
   */
  get(index: number): Track | undefined {
    return this.items[index];
  }

  /**
   * Insert track at specific index
   * @param index - Position to insert at (0-based)
   * @param track - Track to insert
   */
  insert(index: number, track: Track): void {
    if (index < 0) {
      this.items.unshift(track);
    } else if (index >= this.items.length) {
      this.items.push(track);
    } else {
      this.items.splice(index, 0, track);
    }
  }
}
