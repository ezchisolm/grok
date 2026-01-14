export type Track = {
  title: string;
  url: string;
  streamUrl: string;
  requestedBy: string;
  duration?: number;
};

export class MusicQueue {
  private readonly items: Track[] = [];

  enqueue(track: Track): number {
    this.items.push(track);
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
}
