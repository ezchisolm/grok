const timestamp = () => new Date().toISOString();

export class Logger {
  info(message: string, ...args: unknown[]) {
    console.log(`[INFO  ${timestamp()}] ${message}`, ...args);
  }

  warn(message: string, ...args: unknown[]) {
    console.warn(`[WARN  ${timestamp()}] ${message}`, ...args);
  }

  error(message: string, ...args: unknown[]) {
    console.error(`[ERROR ${timestamp()}] ${message}`, ...args);
  }
}

export const logger = new Logger();
