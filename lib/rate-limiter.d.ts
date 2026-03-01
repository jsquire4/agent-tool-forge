export interface RateLimitResult {
  allowed: boolean;
  /** Seconds until the current window resets. Present only when `allowed` is false. */
  retryAfter?: number;
}

/**
 * Fixed-window per-user per-route rate limiter.
 *
 * Backend is selected automatically:
 * - Redis — if a Redis client is provided (uses INCR + EXPIRE per window key)
 * - Postgres — if a pg.Pool is provided as the third argument (pgPool)
 * - Memory — in-process Map fallback, resets on window boundary
 *
 * Only counts authenticated requests — limits by `userId`, not IP.
 *
 * The constructor now accepts an optional third `pgPool` parameter for
 * Postgres-backed rate limiting in horizontally scaled deployments.
 */
export class RateLimiter {
  constructor(config?: object, redis?: object | null, pgPool?: object | null);

  /**
   * Check whether a request is within the rate limit and increment the counter.
   * Always returns `{ allowed: true }` when rate limiting is disabled.
   */
  check(userId: string, route: string): Promise<RateLimitResult>;
}

/**
 * Factory — creates a RateLimiter from forge config.
 * Reads `config.rateLimit` for `enabled`, `windowMs`, and `maxRequests`.
 */
export function makeRateLimiter(config: object, redis?: object | null, pgPool?: object | null): RateLimiter;
