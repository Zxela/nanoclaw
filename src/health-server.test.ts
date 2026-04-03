import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Server } from 'http';
import fs from 'fs';

vi.mock('fs');
vi.mock('./config.js', () => ({
  DATA_DIR: '/tmp/test-data',
}));
vi.mock('./logger.js', () => ({
  logger: { info: vi.fn(), error: vi.fn() },
}));

// Import after mocks
const { startHealthServer } = await import('./health-server.js');

function getJson(
  port: number,
  path = '/health',
): Promise<{ status: number; body: unknown }> {
  return new Promise((resolve, reject) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const http = require('http');
    const req = http.get(
      `http://127.0.0.1:${port}${path}`,
      (res: import('http').IncomingMessage) => {
        let data = '';
        res.on('data', (chunk: string) => (data += chunk));
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode ?? 0, body: JSON.parse(data) });
          } catch {
            resolve({ status: res.statusCode ?? 0, body: data });
          }
        });
      },
    );
    req.on('error', reject);
  });
}

describe('startHealthServer', () => {
  let server: Server;
  const PORT = 39876;

  beforeEach(() => {
    vi.mocked(fs.readFileSync).mockImplementation((filePath: unknown) => {
      if (String(filePath).endsWith('package.json')) {
        return JSON.stringify({ version: '1.0.0-test' });
      }
      if (String(filePath).endsWith('status.json')) {
        return JSON.stringify({
          activeContainers: 3,
          updatedAt: '2026-04-02T00:00:00.000Z',
        });
      }
      throw new Error(`ENOENT: ${filePath}`);
    });
  });

  afterEach(async () => {
    await new Promise<void>((res) => server?.close(() => res()));
    vi.restoreAllMocks();
  });

  it('returns 200 with health data on GET /health', async () => {
    server = await startHealthServer(PORT, () => 2);
    const { status, body } = await getJson(PORT);

    expect(status).toBe(200);
    expect(body).toMatchObject({
      status: 'ok',
      pid: process.pid,
      registeredGroups: 2,
      activeContainers: 3,
      updatedAt: '2026-04-02T00:00:00.000Z',
    });
    expect(typeof (body as { uptimeSeconds: number }).uptimeSeconds).toBe(
      'number',
    );
  });

  it('returns 404 for unknown paths', async () => {
    server = await startHealthServer(PORT + 1, () => 0);
    const { status } = await getJson(PORT + 1, '/unknown');
    expect(status).toBe(404);
  });

  it('defaults to 0 active containers when status.json is missing', async () => {
    vi.mocked(fs.readFileSync).mockImplementation((filePath: unknown) => {
      if (String(filePath).endsWith('package.json')) {
        return JSON.stringify({ version: '1.0.0-test' });
      }
      throw new Error('ENOENT');
    });

    server = await startHealthServer(PORT + 2, () => 1);
    const { body } = await getJson(PORT + 2);
    expect((body as { activeContainers: number }).activeContainers).toBe(0);
    expect((body as { updatedAt: null }).updatedAt).toBeNull();
  });
});
