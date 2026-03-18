# NanoClaw Observability

This directory contains everything needed to add Prometheus + Grafana monitoring
to your NanoClaw deployment.

## Overview

The agent runner exposes a `/metrics` endpoint (port 9090 by default) in the
Prometheus text format. Prometheus scrapes this endpoint on a 15-second interval.
Grafana connects to Prometheus and visualises the data.

```
[agent-runner :9090/metrics] <-- scrape -- [Prometheus :9090] <-- query -- [Grafana :3000]
```

## Metrics Reference

### Counters

| Metric | Labels | Description |
|--------|--------|-------------|
| `andy_messages_total` | `channel`, `status` | Messages processed. `status` is `success` or `error`. `channel` is the messaging platform (e.g. `whatsapp`, `telegram`, `discord`). |
| `andy_skill_invocations_total` | `skill_name`, `status` | Skill invocations. `skill_name` is the slash-command name (e.g. `commit`, `review-pr`). |
| `andy_task_runs_total` | `task_name`, `status` | Scheduled task runs. `task_name` is the human-readable task identifier. |
| `andy_tokens_total` | `direction` | Tokens consumed. `direction` is `input` (prompt) or `output` (completion). |
| `andy_prs_total` | `status` | Pull request events. `status` is `opened`, `merged`, or `closed`. |
| `andy_tool_calls_total` | `tool_name`, `status` | Individual tool calls made inside an agent turn. `tool_name` is the full tool name including MCP prefix. |

### Histograms

| Metric | Labels | Buckets (ms) | Description |
|--------|--------|--------------|-------------|
| `andy_response_latency_ms` | `channel` | 500, 1000, 2000, 5000, 10000, 30000 | Wall-clock time from first message receipt to final response delivery. |

### Gauges

| Metric | Labels | Description |
|--------|--------|-------------|
| `andy_skills_installed` | — | Current number of installed skills. |
| `andy_scheduled_tasks_active` | — | Current number of active (non-paused) scheduled tasks. |
| `andy_doomsday_seconds` | — | Latest doomsday clock reading in seconds to midnight, as reported by the doomsday check task. |

Default Node.js process metrics are also collected under the `andy_nodejs_` prefix
(heap, event loop lag, GC pauses, active handles, etc.).

## Quick Start

### 1. Enable the metrics server

In your agent runner startup code, call `startMetricsServer()` before entering
the main loop:

```typescript
import { startMetricsServer } from './metrics.js';

startMetricsServer(); // listens on $METRICS_PORT (default 9090)
```

The port is configurable via the `METRICS_PORT` environment variable.

### 2. Record metrics from your code

```typescript
import {
  recordMessage,
  recordSkillInvocation,
  recordTaskRun,
  recordTokens,
  recordPr,
  recordToolCall,
  recordResponseLatency,
  setSkillsInstalled,
  setScheduledTasksActive,
  setDoomsdayClock,
} from './metrics.js';

// After processing a message
recordMessage('whatsapp', 'success');

// Wrap a skill invocation
try {
  await runSkill(skillName, args);
  recordSkillInvocation(skillName, 'success');
} catch (err) {
  recordSkillInvocation(skillName, 'error');
  throw err;
}

// Token usage from SDK response
recordTokens('input', usage.inputTokens);
recordTokens('output', usage.outputTokens);

// Latency (measure wall time around a full turn)
const start = Date.now();
await handleTurn();
recordResponseLatency(channel, Date.now() - start);
```

### 3. Start the observability stack

```bash
# From the repo root
docker compose \
  -f docker-compose.yml \
  -f docs/observability/docker-compose.observability.yml \
  up -d
```

Then open:
- Grafana: http://localhost:3000 (default credentials: admin / nanoclaw)
- Prometheus: http://localhost:9090

### 4. Grafana setup

1. Log in to Grafana at http://localhost:3000.
2. Grafana is pre-provisioned (via the `grafana/provisioning/` directory) with
   a Prometheus data source pointing at `http://prometheus:9090`.
3. Import a dashboard or create your own. Useful starting queries:

```promql
# Message rate by channel (last 5 min)
rate(andy_messages_total[5m])

# Error rate
rate(andy_messages_total{status="error"}[5m])
  / rate(andy_messages_total[5m])

# p95 response latency by channel
histogram_quantile(0.95, rate(andy_response_latency_ms_bucket[10m]))

# Token burn rate (tokens/min)
rate(andy_tokens_total[1m]) * 60

# Active tasks
andy_scheduled_tasks_active

# Doomsday clock (minutes to midnight)
andy_doomsday_seconds / 60
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `METRICS_PORT` | `9090` | Port the `/metrics` HTTP server listens on inside the container. |
| `GRAFANA_ADMIN_USER` | `admin` | Grafana admin username (docker-compose only). |
| `GRAFANA_ADMIN_PASSWORD` | `nanoclaw` | Grafana admin password (docker-compose only). **Change this in production.** |

## Files in This Directory

| File | Description |
|------|-------------|
| `docker-compose.observability.yml` | Compose override that adds Prometheus and Grafana services. |
| `prometheus.yml` | Prometheus scrape configuration. |
| `README.md` | This file. |

## Security Notes

- The `/metrics` endpoint is unauthenticated. In production, restrict access to
  it via your network configuration or a reverse proxy with IP allowlisting.
- Change the default Grafana admin password before exposing Grafana externally.
- The metrics HTTP server is a separate, lightweight server from the main agent
  runner and does not affect agent functionality if it fails to start.
