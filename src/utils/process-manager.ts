// Process manager for tracking and cleaning up spawned processes

import type { Subprocess } from "bun";
import type { ChildProcess } from "child_process";

// Union type for both Bun and Node.js processes
type AnyProcess = Subprocess | ChildProcess;

interface TrackedProcess {
  proc: AnyProcess;
  command: string;
  startedAt: Date;
  timeout?: ReturnType<typeof setTimeout>;
}

// Type guard to check if it's a Bun subprocess
function isBunProcess(proc: AnyProcess): proc is Subprocess {
  return 'exited' in proc && proc.exited instanceof Promise;
}

export class ProcessManager {
  private activeProcesses = new Set<TrackedProcess>();
  private readonly defaultTimeoutMs: number;

  constructor(defaultTimeoutMs = 60000) {
    this.defaultTimeoutMs = defaultTimeoutMs;
  }

  /**
   * Track a spawned process (supports both Bun and Node.js processes)
   */
  track(proc: AnyProcess, command: string, timeoutMs?: number): TrackedProcess {
    const tracked: TrackedProcess = {
      proc,
      command,
      startedAt: new Date(),
    };

    // Set up timeout if specified
    const timeout = timeoutMs ?? this.defaultTimeoutMs;
    if (timeout > 0) {
      tracked.timeout = setTimeout(() => {
        console.warn(`[ProcessManager] Process timed out: ${command}`);
        this.kill(tracked, 9);
      }, timeout);
    }

    // Clean up when process exits
    if (isBunProcess(proc)) {
      // Bun subprocess
      proc.exited.then(() => {
        this.remove(tracked);
      }).catch(() => {
        this.remove(tracked);
      });
    } else {
      // Node.js ChildProcess
      // Use once() instead of on() to prevent memory leaks
      proc.once('exit', () => {
        this.remove(tracked);
      });
      proc.once('error', () => {
        this.remove(tracked);
      });
    }

    this.activeProcesses.add(tracked);
    return tracked;
  }

  /**
   * Kill a tracked process
   */
  kill(tracked: TrackedProcess, signal: 15 | 9 = 15): boolean {
    try {
      if (tracked.timeout) {
        clearTimeout(tracked.timeout);
        tracked.timeout = undefined;
      }

      tracked.proc.kill(signal);
      
      // For SIGTERM, schedule SIGKILL fallback
      if (signal === 15) {
        setTimeout(() => {
          try {
            // Check if still in active set (not cleaned up)
            if (this.activeProcesses.has(tracked)) {
              console.warn(`[ProcessManager] Process didn't terminate gracefully, sending SIGKILL`);
              tracked.proc.kill(9);
            }
          } catch {
            // Already dead
          }
        }, 5000);
      }

      return true;
    } catch {
      return false;
    }
  }

  /**
   * Remove a process from tracking
   */
  remove(tracked: TrackedProcess): void {
    if (tracked.timeout) {
      clearTimeout(tracked.timeout);
      tracked.timeout = undefined;
    }
    this.activeProcesses.delete(tracked);
  }

  /**
   * Kill all tracked processes
   */
  cleanup(signal: 15 | 9 = 15): void {
    console.log(`[ProcessManager] Cleaning up ${this.activeProcesses.size} process(es)...`);
    
    for (const tracked of this.activeProcesses) {
      this.kill(tracked, signal);
    }
    
    this.activeProcesses.clear();
  }

  /**
   * Get count of active processes
   */
  getActiveCount(): number {
    return this.activeProcesses.size;
  }

  /**
   * Get list of active processes (for debugging)
   */
  getActiveProcesses(): { command: string; startedAt: Date; runtimeMs: number }[] {
    const now = Date.now();
    return Array.from(this.activeProcesses).map((tracked) => ({
      command: tracked.command,
      startedAt: tracked.startedAt,
      runtimeMs: now - tracked.startedAt.getTime(),
    }));
  }
}

// Global process manager instance
export const globalProcessManager = new ProcessManager();

// Cleanup on exit
process.on("SIGINT", () => {
  globalProcessManager.cleanup(9);
});

process.on("SIGTERM", () => {
  globalProcessManager.cleanup(9);
});

process.on("exit", () => {
  globalProcessManager.cleanup(9);
});
