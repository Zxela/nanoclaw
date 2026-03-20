/**
 * Standalone debug query runner.
 * Writes a debug_query task to IPC for the live NanoClaw process to handle.
 * Then polls for the response file.
 */
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const groupFolder = process.argv[2] || 'discord_general';
const question = process.argv[3] || 'What are the most pressing issues in this group? Review the CLAUDE.md, workspace files, recent conversation archives, and any error logs. Report on: current state of the workspace, any problems or errors you find, and what needs attention.';

const queryId = crypto.randomUUID();
const tasksDir = path.join(DATA_DIR, 'ipc', groupFolder, 'tasks');
const debugDir = path.join(DATA_DIR, 'ipc', groupFolder, 'debug');

fs.mkdirSync(tasksDir, { recursive: true });
fs.mkdirSync(debugDir, { recursive: true });

// Clean up any stale debug files
try { fs.unlinkSync(path.join(debugDir, 'query.json')); } catch {}
try { fs.unlinkSync(path.join(debugDir, 'response.json')); } catch {}

// Write debug query request as an IPC task (sendDebugQuery handles the rest)
const taskFile = path.join(tasksDir, `debug-${queryId}.json`);
const tempFile = `${taskFile}.tmp`;
fs.writeFileSync(tempFile, JSON.stringify({
  type: 'debug_query',
  queryId,
  question,
}));
fs.renameSync(tempFile, taskFile);

console.log(`Query ID: ${queryId}`);
console.log(`Group: ${groupFolder}`);
console.log(`Question: ${question.slice(0, 80)}...`);
console.log('Waiting for response from live NanoClaw process...');

// Poll for response — sendDebugQuery writes response.json
const TIMEOUT = 300_000;
const start = Date.now();
const poll = () => {
  const responseFile = path.join(debugDir, 'response.json');
  try {
    if (fs.existsSync(responseFile)) {
      const data = JSON.parse(fs.readFileSync(responseFile, 'utf-8'));
      if (data.answer) {
        console.log('\n=== RESPONSE ===');
        console.log(JSON.stringify(data, null, 2));
        try { fs.unlinkSync(responseFile); } catch {}
        try { fs.unlinkSync(path.join(debugDir, 'query.json')); } catch {}
        process.exit(0);
      }
    }
  } catch {}

  if (Date.now() - start > TIMEOUT) {
    console.error('Timed out waiting for response');
    process.exit(1);
  }

  setTimeout(poll, 1000);
};
poll();
