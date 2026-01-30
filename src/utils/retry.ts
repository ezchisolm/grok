// Retry utility with exponential backoff for transient errors

export interface RetryOptions {
  maxRetries?: number;
  baseDelay?: number;
  maxDelay?: number;
  jitter?: boolean;
}

export class RetryableError extends Error {
  constructor(message: string, public override readonly cause?: Error) {
    super(message);
    this.name = 'RetryableError';
  }
}

export class PermanentError extends Error {
  constructor(message: string, public override readonly cause?: Error) {
    super(message);
    this.name = 'PermanentError';
  }
}

/**
 * Check if an error is retryable (transient) or permanent
 */
export function isRetryableError(error: unknown): boolean {
  if (error instanceof RetryableError) return true;
  if (error instanceof PermanentError) return false;
  
  const message = String(error).toLowerCase();
  
  // Retryable errors (transient)
  const retryablePatterns = [
    '403',                    // Expired signature/rate limit
    '429',                    // Rate limited
    'timeout',
    'etimedout',
    'econnreset',
    'econnrefused',
    'socket hang up',
    'network error',
    'temporary',
    'rate limit',
    'retry',
  ];
  
  // Permanent errors (don't retry)
  const permanentPatterns = [
    'video unavailable',
    'private',
    'deleted',
    'age verification',
    'sign in to confirm',
    'copyright',
    'region restriction',
    'not found',
    'invalid url',
  ];
  
  // Check permanent first (takes precedence)
  if (permanentPatterns.some(p => message.includes(p))) {
    return false;
  }
  
  return retryablePatterns.some(p => message.includes(p));
}

/**
 * Execute an operation with exponential backoff retry logic
 * 
 * @param operation - The async operation to execute
 * @param options - Retry configuration
 * @returns The result of the operation
 * @throws The last error encountered after all retries are exhausted
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxRetries = 3,
    baseDelay = 1000,
    maxDelay = 30000,
    jitter = true,
  } = options;
  
  let lastError: Error | undefined;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      // Check if we should retry
      if (attempt === maxRetries || !isRetryableError(error)) {
        throw error;
      }
      
      // Calculate delay: baseDelay * 2^attempt + optional jitter
      let delay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay);
      
      if (jitter) {
        // Add random jitter (±25%)
        const jitterAmount = delay * 0.25;
        delay = delay + (Math.random() * jitterAmount * 2 - jitterAmount);
      }
      
      console.log(`[Retry] Attempt ${attempt + 1}/${maxRetries + 1} failed: ${lastError.message}. Retrying in ${Math.round(delay)}ms...`);
      
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  // Should never reach here, but TypeScript needs it
  throw lastError ?? new Error('Max retries exceeded');
}

/**
 * Circuit breaker pattern to prevent hammering failing services
 */
export class CircuitBreaker {
  private failures = 0;
  private lastFailureTime?: number;
  private state: 'closed' | 'open' | 'half-open' = 'closed';
  
  constructor(
    private readonly failureThreshold = 5,
    private readonly resetTimeout = 60000, // 1 minute
  ) {}
  
  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.state === 'open') {
      const now = Date.now();
      if (this.lastFailureTime && (now - this.lastFailureTime) > this.resetTimeout) {
        this.state = 'half-open';
        this.failures = 0;
      } else {
        throw new RetryableError('Circuit breaker is open. Too many recent failures.');
      }
    }
    
    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }
  
  private onSuccess(): void {
    this.failures = 0;
    this.state = 'closed';
  }
  
  private onFailure(): void {
    this.failures++;
    this.lastFailureTime = Date.now();
    
    if (this.failures >= this.failureThreshold) {
      this.state = 'open';
      console.warn(`[CircuitBreaker] Opened after ${this.failures} failures. Will retry after ${this.resetTimeout}ms.`);
    }
  }
  
  getState(): string {
    return this.state;
  }
}
