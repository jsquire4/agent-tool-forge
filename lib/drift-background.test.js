import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeTestDb } from '../tests/helpers/db.js';
import { upsertToolRegistry, insertEvalRun } from './db.js';
import { createDriftMonitor } from './drift-background.js';

describe('drift-background', () => {
  let db;
  beforeEach(() => { db = makeTestDb(); });

  it('start and stop work without error', () => {
    const monitor = createDriftMonitor({}, db, 60_000);
    monitor.start();
    monitor.stop();
  });

  it('runOnce checks promoted tools', () => {
    // Setup: promote a tool with some eval runs
    upsertToolRegistry(db, {
      tool_name: 'tool_a',
      spec_json: '{}',
      lifecycle_state: 'promoted',
      baseline_pass_rate: 0.95
    });

    // Add eval runs (stable — no drift expected)
    for (let i = 0; i < 5; i++) {
      insertEvalRun(db, {
        tool_name: 'tool_a',
        total_cases: 10,
        passed: 9,
        failed: 1,
        pass_rate: 0.9
      });
    }

    const monitor = createDriftMonitor({ drift: { threshold: 0.1, windowSize: 5 } }, db);

    // Should not throw
    monitor.runOnce();
  });

  it('does not crash when no promoted tools exist', () => {
    const monitor = createDriftMonitor({}, db);
    monitor.runOnce(); // Should not throw
  });

  it('start is idempotent (calling twice does not create two intervals)', () => {
    const monitor = createDriftMonitor({}, db, 60_000);
    monitor.start();
    monitor.start(); // Second call should be no-op
    monitor.stop();
  });
});

describe('drift-background — Postgres path', () => {
  it('skips tools with no baseline_pass_rate', async () => {
    const queries = [];
    const pgStore = {
      async getAllToolRegistry() {
        return [{ tool_name: 'tool_a', lifecycle_state: 'promoted', baseline_pass_rate: null }];
      }
    };
    const evalStore = { async getPerToolRunHistory() { return []; } };
    const _pgPool = { async query(sql) { queries.push(sql); return { rows: [] }; } };

    const monitor = createDriftMonitor({}, null, 60_000, { pgStore, evalStore, _pgPool });
    await monitor.runOnce();
    // No drift_alerts query should have been made since baseline is null
    expect(queries.every(q => !q.includes('drift_alerts'))).toBe(true);
  });

  it('skips tools with no eval run history', async () => {
    const queries = [];
    const pgStore = {
      async getAllToolRegistry() {
        return [{ tool_name: 'tool_b', lifecycle_state: 'promoted', baseline_pass_rate: 0.9 }];
      }
    };
    const evalStore = { async getPerToolRunHistory() { return []; } };
    const _pgPool = { async query(sql) { queries.push(sql); return { rows: [] }; } };

    const monitor = createDriftMonitor({}, null, 60_000, { pgStore, evalStore, _pgPool });
    await monitor.runOnce();
    expect(queries.every(q => !q.includes('drift_alerts'))).toBe(true);
  });

  it('inserts drift alert when delta exceeds threshold', async () => {
    const committed = [];
    const client = {
      async query(sql) {
        committed.push(sql);
        return { rows: [] };
      },
      release() {}
    };
    const pgStore = {
      async getAllToolRegistry() {
        return [{ tool_name: 'tool_c', lifecycle_state: 'promoted', baseline_pass_rate: 0.95 }];
      }
    };
    const evalStore = {
      async getPerToolRunHistory() {
        // avg = 0.5 → delta = 0.45 > default threshold 0.1
        return [{ pass_rate: 0.5 }, { pass_rate: 0.5 }];
      }
    };
    const _pgPool = {
      async query(sql) {
        // No open alert exists
        return { rows: [] };
      },
      async connect() { return client; }
    };

    const monitor = createDriftMonitor({ drift: { threshold: 0.1 } }, null, 60_000, { pgStore, evalStore, _pgPool });
    await monitor.runOnce();
    expect(committed.some(q => q.includes('BEGIN'))).toBe(true);
    expect(committed.some(q => q.includes('drift_alerts'))).toBe(true);
    expect(committed.some(q => q.includes('COMMIT'))).toBe(true);
  });

  it('skips insert when open alert already exists', async () => {
    const committed = [];
    const pgStore = {
      async getAllToolRegistry() {
        return [{ tool_name: 'tool_d', lifecycle_state: 'promoted', baseline_pass_rate: 0.95 }];
      }
    };
    const evalStore = {
      async getPerToolRunHistory() { return [{ pass_rate: 0.5 }]; }
    };
    const _pgPool = {
      async query(sql) {
        // Simulate an existing open alert
        if (sql.includes('drift_alerts')) return { rows: [{ id: 42 }] };
        return { rows: [] };
      },
      async connect() {
        return { async query(s) { committed.push(s); return { rows: [] }; }, release() {} };
      }
    };

    const monitor = createDriftMonitor({ drift: { threshold: 0.1 } }, null, 60_000, { pgStore, evalStore, _pgPool });
    await monitor.runOnce();
    // No transaction should have been opened
    expect(committed).toHaveLength(0);
  });
});
