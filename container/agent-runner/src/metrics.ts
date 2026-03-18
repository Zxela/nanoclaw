/**
 * NanoClaw Prometheus Metrics
 *
 * Exposes an HTTP server on port 9090 (or METRICS_PORT env var) at /metrics.
 * Uses prom-client to track agent activity: messages, skill invocations,
 * task runs, token usage, response latency, and more.
 *
 * Usage:
 *   import { startMetricsServer, recordMessage } from './metrics.js';
 *   startMetricsServer();
 *   recordMessage('whatsapp', 'success');
 */

import http from 'http';
import {
  Registry,
  Counter,
  Histogram,
  Gauge,
  collectDefaultMetrics,
} from 'prom-client';

const registry = new Registry();

// Collect Node.js default metrics (heap, event loop, GC, etc.)
collectDefaultMetrics({ register: registry, prefix: 'andy_nodejs_' });

// ---------------------------------------------------------------------------
// Counters
// ---------------------------------------------------------------------------

const messagesTotal = new Counter({
  name: 'andy_messages_total',
  help: 'Total number of messages processed by the agent',
  labelNames: ['channel', 'status'] as const,
  registers: [registry],
});

const skillInvocationsTotal = new Counter({
  name: 'andy_skill_invocations_total',
  help: 'Total number of skill invocations',
  labelNames: ['skill_name', 'status'] as const,
  registers: [registry],
});

const taskRunsTotal = new Counter({
  name: 'andy_task_runs_total',
  help: 'Total number of scheduled task runs',
  labelNames: ['task_name', 'status'] as const,
  registers: [registry],
});

const tokensTotal = new Counter({
  name: 'andy_tokens_total',
  help: 'Total tokens consumed, split by direction',
  labelNames: ['direction'] as const,
  registers: [registry],
});

const prsTotal = new Counter({
  name: 'andy_prs_total',
  help: 'Total pull requests by status',
  labelNames: ['status'] as const,
  registers: [registry],
});

const toolCallsTotal = new Counter({
  name: 'andy_tool_calls_total',
  help: 'Total tool calls made by the agent',
  labelNames: ['tool_name', 'status'] as const,
  registers: [registry],
});

// ---------------------------------------------------------------------------
// Histograms
// ---------------------------------------------------------------------------

const responseLatencyMs = new Histogram({
  name: 'andy_response_latency_ms',
  help: 'End-to-end response latency in milliseconds, by channel',
  labelNames: ['channel'] as const,
  buckets: [500, 1000, 2000, 5000, 10000, 30000],
  registers: [registry],
});

// ---------------------------------------------------------------------------
// Gauges
// ---------------------------------------------------------------------------

const skillsInstalled = new Gauge({
  name: 'andy_skills_installed',
  help: 'Number of skills currently installed',
  registers: [registry],
});

const scheduledTasksActive = new Gauge({
  name: 'andy_scheduled_tasks_active',
  help: 'Number of currently active scheduled tasks',
  registers: [registry],
});

const doomsdaySeconds = new Gauge({
  name: 'andy_doomsday_seconds',
  help: 'Doomsday clock reading in seconds to midnight',
  registers: [registry],
});

// ---------------------------------------------------------------------------
// HTTP server
// ---------------------------------------------------------------------------

/**
 * Start the Prometheus metrics HTTP server.
 * Listens on METRICS_PORT (default 9090) at /metrics.
 */
export function startMetricsServer(): void {
  const port = parseInt(process.env.METRICS_PORT ?? '9090', 10);

  const server = http.createServer(async (req, res) => {
    if (req.method === 'GET' && req.url === '/metrics') {
      try {
        const output = await registry.metrics();
        res.writeHead(200, { 'Content-Type': registry.contentType });
        res.end(output);
      } catch (err) {
        res.writeHead(500);
        res.end(`Error collecting metrics: ${err instanceof Error ? err.message : String(err)}`);
      }
    } else if (req.method === 'GET' && req.url === '/healthz') {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('ok');
    } else {
      res.writeHead(404);
      res.end('Not found');
    }
  });

  server.listen(port, () => {
    console.error(`[metrics] Prometheus metrics server listening on :${port}/metrics`);
  });

  server.on('error', (err) => {
    console.error(`[metrics] Server error: ${err.message}`);
  });
}

// ---------------------------------------------------------------------------
// Helper functions for recording metrics
// ---------------------------------------------------------------------------

/**
 * Record a message processed by the agent.
 * @param channel  The messaging channel (e.g. 'whatsapp', 'telegram', 'discord')
 * @param status   'success' if the agent responded without error, 'error' otherwise
 */
export function recordMessage(channel: string, status: 'success' | 'error'): void {
  messagesTotal.inc({ channel, status });
}

/**
 * Record a skill invocation.
 * @param skillName  Name of the skill (e.g. 'commit', 'review-pr')
 * @param status     'success' if the skill ran without throwing, 'error' otherwise
 */
export function recordSkillInvocation(skillName: string, status: 'success' | 'error'): void {
  skillInvocationsTotal.inc({ skill_name: skillName, status });
}

/**
 * Record a scheduled task run.
 * @param taskName  Human-readable or internal name of the task
 * @param status    'success' or 'error'
 */
export function recordTaskRun(taskName: string, status: 'success' | 'error'): void {
  taskRunsTotal.inc({ task_name: taskName, status });
}

/**
 * Record token usage.
 * @param direction  'input' for prompt tokens, 'output' for completion tokens
 * @param count      Number of tokens to add
 */
export function recordTokens(direction: 'input' | 'output', count: number): void {
  tokensTotal.inc({ direction }, count);
}

/**
 * Record a pull request event.
 * @param status  'opened' | 'merged' | 'closed'
 */
export function recordPr(status: 'opened' | 'merged' | 'closed'): void {
  prsTotal.inc({ status });
}

/**
 * Record a tool call made by the agent.
 * @param toolName  Name of the tool (e.g. 'Bash', 'Read', 'mcp__nanoclaw__send_message')
 * @param status    'success' or 'error'
 */
export function recordToolCall(toolName: string, status: 'success' | 'error'): void {
  toolCallsTotal.inc({ tool_name: toolName, status });
}

/**
 * Record the end-to-end response latency for a channel.
 * @param channel  The messaging channel
 * @param ms       Elapsed time in milliseconds
 */
export function recordResponseLatency(channel: string, ms: number): void {
  responseLatencyMs.observe({ channel }, ms);
}

/**
 * Set the current number of installed skills.
 * @param count  Total installed skill count
 */
export function setSkillsInstalled(count: number): void {
  skillsInstalled.set(count);
}

/**
 * Set the current number of active scheduled tasks.
 * @param count  Active task count
 */
export function setScheduledTasksActive(count: number): void {
  scheduledTasksActive.set(count);
}

/**
 * Update the doomsday clock gauge.
 * @param seconds  Seconds to midnight as reported by the doomsday clock check task
 */
export function setDoomsdayClock(seconds: number): void {
  doomsdaySeconds.set(seconds);
}
