/**
 * Health check HTTP server.
 * Operators can poll GET /health to verify NanoClaw is running.
 *
 * Response JSON:
 *   status          "ok"
 *   version         package.json version
 *   pid             process PID
 *   uptimeSeconds   seconds since process start
 *   registeredGroups  number of groups currently registered
 *   activeContainers  number of agent containers currently running
 *   updatedAt       ISO timestamp from the last status.json write
 */
import { createServer, Server, IncomingMessage, ServerResponse } from 'http';
import fs from 'fs';
import path from 'path';

import { DATA_DIR } from './config.js';
import { logger } from './logger.js';

function readVersion(): string {
  try {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf8'),
    );
    return pkg.version ?? 'unknown';
  } catch {
    return 'unknown';
  }
}

const VERSION = readVersion();

const STATUS_FILE = `${DATA_DIR}/status.json`;
const START_TIME = Date.now();

export interface HealthStatus {
  status: 'ok';
  version: string;
  pid: number;
  uptimeSeconds: number;
  registeredGroups: number;
  activeContainers: number;
  updatedAt: string | null;
}

function readStatusFile(): {
  activeContainers: number;
  updatedAt: string | null;
} {
  try {
    const raw = fs.readFileSync(STATUS_FILE, 'utf8');
    const data = JSON.parse(raw);
    return {
      activeContainers:
        typeof data.activeContainers === 'number' ? data.activeContainers : 0,
      updatedAt: data.updatedAt ?? null,
    };
  } catch {
    return { activeContainers: 0, updatedAt: null };
  }
}

export function startHealthServer(
  port: number,
  getRegisteredGroupCount: () => number,
): Promise<Server> {
  return new Promise((resolve, reject) => {
    const server = createServer((req: IncomingMessage, res: ServerResponse) => {
      if (req.method !== 'GET' || req.url !== '/health') {
        res.writeHead(404);
        res.end('Not Found');
        return;
      }

      const { activeContainers, updatedAt } = readStatusFile();
      const body: HealthStatus = {
        status: 'ok',
        version: VERSION,
        pid: process.pid,
        uptimeSeconds: Math.floor((Date.now() - START_TIME) / 1000),
        registeredGroups: getRegisteredGroupCount(),
        activeContainers,
        updatedAt,
      };

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(body));
    });

    server.on('error', (err) => {
      logger.error({ err, port }, 'Health server error');
      reject(err);
    });

    server.listen(port, '127.0.0.1', () => {
      logger.info({ port }, 'Health check server listening');
      resolve(server);
    });
  });
}
