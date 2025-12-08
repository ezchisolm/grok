import { describe, expect, it } from "vitest";
import { MusicQueue } from "../src/music/queue";

describe("MusicQueue", () => {
  it("enqueues and shifts in order", () => {
    const queue = new MusicQueue();
    queue.enqueue({ title: "a", url: "a", requestedBy: "user" });
    queue.enqueue({ title: "b", url: "b", requestedBy: "user" });

    expect(queue.size()).toBe(2);
    expect(queue.shift()?.title).toBe("a");
    expect(queue.shift()?.title).toBe("b");
    expect(queue.isEmpty()).toBe(true);
  });

  it("peek does not remove item", () => {
    const queue = new MusicQueue();
    queue.enqueue({ title: "a", url: "a", requestedBy: "user" });

    expect(queue.peek()?.title).toBe("a");
    expect(queue.size()).toBe(1);
  });

  it("clear empties the queue", () => {
    const queue = new MusicQueue();
    queue.enqueue({ title: "a", url: "a", requestedBy: "user" });
    queue.enqueue({ title: "b", url: "b", requestedBy: "user" });

    queue.clear();

    expect(queue.isEmpty()).toBe(true);
    expect(queue.size()).toBe(0);
  });
});
