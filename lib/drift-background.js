/**
 * Background Drift Monitor — periodically checks all promoted tools for drift.
 *
 * Reuses checkDrift() and computeSuspects() from drift-monitor.js for the
 * SQLite path. When Postgres is configured, uses an async Postgres path that
 * reads from PostgresEvalStore and PostgresStore instead.
 */

import { getAllToolRegistry, insertDriftAlert } from './db.js';
import { checkDrift, computeSuspects } from './drift-monitor.js';

const DEFAULT_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Create a background drift monitor.
 *
 * @param {object} config — forge config (drift.threshold, drift.windowSize)
 * @param {import('better-sqlite3').Database} db — SQLite db (used when pgCtx is null)
 * @param {number} [intervalMs] — check interval (default 5 min)
 * @param {{ pgStore: object, evalStore: object, _pgPool: object } | null} [pgCtx]
 *   — Postgres context; when provided, the Postgres async path is used instead of SQLite.
 * @returns {{ start(): void, stop(): void, runOnce(): Promise<void> }}
 */
export function createDriftMonitor(config, db, intervalMs = DEFAULT_INTERVAL_MS, pgCtx = null) {
  let timer = null;
  const threshold = config.drift?.threshold ?? 0.1;
  const windowSize = config.drift?.windowSize ?? 5;

  async function runOncePg({ pgStore, evalStore, _pgPool }) {
    const allTools = await pgStore.getAllToolRegistry();
    const promoted = allTools.filter(r => r.lifecycle_state === 'promoted');

    for (const tool of promoted) {
      const baseline = tool.baseline_pass_rate;
      if (baseline == null) continue;

      const history = await evalStore.getPerToolRunHistory(tool.tool_name, windowSize);
      if (!history.length) continue;

      const avg = history.reduce((s, r) => s + (r.pass_rate || 0), 0) / history.length;
      const delta = baseline - avg;
      if (delta < threshold) continue;

      // Skip if an open alert already exists
      const { rows: [existing] } = await _pgPool.query(
        `SELECT id FROM drift_alerts WHERE tool_name = $1 AND status = 'open' LIMIT 1`,
        [tool.tool_name]
      );
      if (existing) continue;

      const now = new Date().toISOString();
      const client = await _pgPool.connect();
      try {
        await client.query('BEGIN');
        await client.query(
          `INSERT INTO drift_alerts
             (tool_name, detected_at, trigger_tools, baseline_rate, current_rate, delta, status)
           VALUES ($1,$2,$3,$4,$5,$6,'open')`,
          [tool.tool_name, now, '[]', baseline, avg, delta]
        );
        await client.query(
          `UPDATE tool_registry SET lifecycle_state = 'flagged', flagged_at = $1
           WHERE tool_name = $2 AND lifecycle_state != 'flagged'`,
          [now, tool.tool_name]
        );
        await client.query('COMMIT');
      } catch (e) {
        await client.query('ROLLBACK');
        process.stderr.write(`[drift-monitor] Postgres alert insert failed for ${tool.tool_name}: ${e.message}\n`);
      } finally {
        client.release();
      }
    }
  }

  function runOnceSqlite() {
    try {
      const tools = getAllToolRegistry(db).filter(r => r.lifecycle_state === 'promoted');
      for (const tool of tools) {
        const drift = checkDrift(db, tool.tool_name, threshold, windowSize);
        if (drift.drifted) {
          const suspects = computeSuspects(db, tool.tool_name);
          insertDriftAlert(db, {
            tool_name: tool.tool_name,
            trigger_tools: suspects.map(s => s.tool_name).join(','),
            baseline_rate: drift.baseline,
            current_rate: drift.current,
            delta: drift.delta
          });
        }
      }
    } catch (err) {
      process.stderr.write(`[drift-monitor] Error during check: ${err.message}\n`);
    }
  }

  async function runOnce() {
    if (pgCtx) {
      try {
        await runOncePg(pgCtx);
      } catch (err) {
        process.stderr.write(`[drift-monitor] Postgres error during check: ${err.message}\n`);
      }
    } else {
      runOnceSqlite();
    }
  }

  return {
    start() {
      if (timer) return;
      timer = setInterval(() => { runOnce().catch(() => {}); }, intervalMs);
      timer.unref(); // Don't block process exit
    },
    stop() {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    },
    runOnce
  };
}
