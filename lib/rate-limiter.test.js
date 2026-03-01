import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RateLimiter, PostgresRateLimiter, makeRateLimiter } from './rate-limiter.js';

describe('RateLimiter', () => {
  describe('disabled (passthrough)', () => {
    it('always allows when enabled=false', async () => {
      const rl = new RateLimiter({ enabled: false });
      expect(await rl.check('user1', '/api/chat')).toEqual({ allowed: true });
      expect(await rl.check('user1', '/api/chat')).toEqual({ allowed: true });
    });
  });

  describe('in-memory backend', () => {
    it('allows requests within window', async () => {
      const rl = new RateLimiter({ enabled: true, windowMs: 60_000, maxRequests: 3 });
      expect((await rl.check('u1', '/chat')).allowed).toBe(true);
      expect((await rl.check('u1', '/chat')).allowed).toBe(true);
      expect((await rl.check('u1', '/chat')).allowed).toBe(true);
    });

    it('blocks requests over the limit', async () => {
      const rl = new RateLimiter({ enabled: true, windowMs: 60_000, maxRequests: 2 });
      await rl.check('u1', '/chat');
      await rl.check('u1', '/chat');
      const result = await rl.check('u1', '/chat');
      expect(result.allowed).toBe(false);
      expect(typeof result.retryAfter).toBe('number');
      expect(result.retryAfter).toBeGreaterThan(0);
    });

    it('different users have independent counters', async () => {
      const rl = new RateLimiter({ enabled: true, windowMs: 60_000, maxRequests: 1 });
      await rl.check('u1', '/chat');
      expect((await rl.check('u1', '/chat')).allowed).toBe(false);
      expect((await rl.check('u2', '/chat')).allowed).toBe(true); // different user
    });

    it('different routes have independent counters', async () => {
      const rl = new RateLimiter({ enabled: true, windowMs: 60_000, maxRequests: 1 });
      await rl.check('u1', '/chat');
      expect((await rl.check('u1', '/chat')).allowed).toBe(false);
      expect((await rl.check('u1', '/chat-sync')).allowed).toBe(true); // different route
    });

    it('window reset allows new requests', async () => {
      const rl = new RateLimiter({ enabled: true, windowMs: 1, maxRequests: 1 });
      await rl.check('u1', '/chat');
      // Wait for window to pass
      await new Promise(r => setTimeout(r, 5));
      // New window — counter reset
      expect((await rl.check('u1', '/chat')).allowed).toBe(true);
    });
  });

  describe('Redis backend', () => {
    function createRedisMock() {
      const store = new Map();
      return {
        store,
        // Simulates the atomic Lua INCR+EXPIRE script used by _checkRedis().
        // node-redis v4 eval signature: eval(script, { keys, arguments })
        async eval(_script, { keys, arguments: args }) {
          const key = keys[0];
          const ttl = Number(args[0]);
          const v = (Number(store.get(key) ?? 0)) + 1;
          store.set(key, v);
          if (v === 1) store.set(key + ':ttl', ttl);
          return v;
        },
      };
    }

    it('allows requests within limit', async () => {
      const redis = createRedisMock();
      const rl = new RateLimiter({ enabled: true, windowMs: 60_000, maxRequests: 3 }, redis);
      expect((await rl.check('u1', '/chat')).allowed).toBe(true);
      expect((await rl.check('u1', '/chat')).allowed).toBe(true);
      expect((await rl.check('u1', '/chat')).allowed).toBe(true);
    });

    it('blocks on limit exceeded', async () => {
      const redis = createRedisMock();
      const rl = new RateLimiter({ enabled: true, windowMs: 60_000, maxRequests: 2 }, redis);
      await rl.check('u1', '/chat');
      await rl.check('u1', '/chat');
      const result = await rl.check('u1', '/chat');
      expect(result.allowed).toBe(false);
      expect(result.retryAfter).toBeGreaterThan(0);
    });

    it('sets TTL on first increment', async () => {
      const redis = createRedisMock();
      const rl = new RateLimiter({ enabled: true, windowMs: 60_000, maxRequests: 10 }, redis);
      await rl.check('u1', '/chat');
      // Find the TTL entry
      const ttlKey = [...redis.store.keys()].find(k => k.endsWith(':ttl'));
      expect(ttlKey).toBeDefined();
      expect(redis.store.get(ttlKey)).toBe(60); // 60s
    });

    it('passthrough when disabled even with redis', async () => {
      const redis = createRedisMock();
      const rl = new RateLimiter({ enabled: false }, redis);
      expect((await rl.check('u1', '/chat')).allowed).toBe(true);
      expect(redis.store.size).toBe(0); // no Redis calls
    });
  });

  describe('makeRateLimiter factory', () => {
    it('creates disabled limiter when enabled not set', async () => {
      const rl = makeRateLimiter({});
      expect((await rl.check('u1', '/chat')).allowed).toBe(true);
    });

    it('creates enabled limiter from config', async () => {
      const rl = makeRateLimiter({ rateLimit: { enabled: true, windowMs: 60_000, maxRequests: 1 } });
      await rl.check('u1', '/chat');
      expect((await rl.check('u1', '/chat')).allowed).toBe(false);
    });

    it('uses PostgresRateLimiter when pgPool provided and no redis', async () => {
      const upserted = [];
      const pgPool = {
        async query(sql, params) {
          upserted.push({ sql, params });
          return { rows: [{ count: 1 }] };
        }
      };
      const rl = makeRateLimiter({ rateLimit: { enabled: true, maxRequests: 10 } }, null, pgPool);
      const result = await rl.check('u1', '/chat');
      expect(result.allowed).toBe(true);
      expect(upserted[0].sql).toContain('rate_limit_buckets');
    });

    it('passes redis client to limiter', async () => {
      const store = new Map();
      const redis = {
        store,
        async eval(_script, { keys, arguments: args }) {
          const key = keys[0];
          const ttl = Number(args[0]);
          const v = (Number(store.get(key) ?? 0)) + 1;
          store.set(key, v);
          if (v === 1) store.set(key + ':ttl', ttl);
          return v;
        },
      };
      const rl = makeRateLimiter({ rateLimit: { enabled: true, maxRequests: 10 } }, redis);
      await rl.check('u1', '/chat');
      expect(redis.store.size).toBeGreaterThan(0);
    });
  });
});

describe('PostgresRateLimiter', () => {
  it('allows requests under the limit', async () => {
    const pgPool = {
      async query() { return { rows: [{ count: 1 }] }; }
    };
    const rl = new PostgresRateLimiter({ enabled: true, maxRequests: 5 }, pgPool);
    expect((await rl.check('u1', '/chat')).allowed).toBe(true);
  });

  it('blocks requests over the limit', async () => {
    const pgPool = {
      async query() { return { rows: [{ count: 6 }] }; }
    };
    const rl = new PostgresRateLimiter({ enabled: true, maxRequests: 5 }, pgPool);
    const result = await rl.check('u1', '/chat');
    expect(result.allowed).toBe(false);
    expect(typeof result.retryAfter).toBe('number');
  });

  it('always allows when disabled', async () => {
    const pgPool = { async query() { return { rows: [] }; } };
    const rl = new PostgresRateLimiter({ enabled: false }, pgPool);
    expect((await rl.check('u1', '/chat')).allowed).toBe(true);
  });

  it('uses ON CONFLICT upsert in SQL', async () => {
    let capturedSql = '';
    const pgPool = {
      async query(sql) { capturedSql = sql; return { rows: [{ count: 1 }] }; }
    };
    const rl = new PostgresRateLimiter({ enabled: true, maxRequests: 10 }, pgPool);
    await rl.check('u1', '/chat');
    expect(capturedSql).toContain('ON CONFLICT');
    expect(capturedSql).toContain('rate_limit_buckets');
  });
});
