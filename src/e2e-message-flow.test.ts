/**
 * End-to-end tests for the full message-to-response flow.
 *
 * Tests the path from message stored in DB → processGroupMessages called →
 * container agent (mocked) produces output → channel.sendMessage called.
 *
 * NAN-53
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  _initTestDatabase,
  getUnprocessedMessages,
  setRegisteredGroup,
  storeChatMetadata,
  storeMessage,
} from './db.js';
// storeMessage is used indirectly inside storeTestMessage helper
import {
  _addTestChannel,
  _clearTestChannels,
  _processGroupMessagesForTest,
  _setRegisteredGroups,
} from './index.js';
import { Channel, NewMessage, RegisteredGroup } from './types.js';

// --- Module mocks ---

vi.mock('./config.js', () => ({
  ASSISTANT_NAME: 'Jarvis',
  TRIGGER_PATTERN: /@jarvis/i,
  DATA_DIR: '/tmp/nanoclaw-e2e-test',
  IDLE_TIMEOUT: 60000,
  TIMEZONE: 'America/Vancouver',
  GOAL_TIMEOUT_DEFAULT: 3600000,
  GOAL_TIMEOUT_MAX: 86400000,
  MAX_CONCURRENT_CONTAINERS: 2,
  MAX_CONTAINERS_PER_GROUP: 2,
  CONTEXT_TOKEN_BUDGET: 6000,
  CONTEXT_MAX_MESSAGES: 100,
}));

vi.mock('./container-runner.js', () => ({
  runContainerAgent: vi.fn(),
  writeGroupsSnapshot: vi.fn(),
  copySkillsForGroup: vi.fn(),
}));

vi.mock('./container-runtime.js', () => ({
  ensureContainerRuntimeRunning: vi.fn(),
  cleanupOrphans: vi.fn(),
  PROXY_BIND_HOST: '127.0.0.1',
  stopContainerAsync: vi.fn(),
}));

vi.mock('./credential-proxy.js', () => ({
  startCredentialProxy: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('./knowledge-vault.js', () => ({
  initKnowledgeVault: vi.fn(),
}));

vi.mock('./group-folder.js', () => ({
  isValidGroupFolder: vi.fn().mockReturnValue(true),
  assertValidGroupFolder: vi.fn(),
  resolveGroupFolderPath: vi.fn((folder: string) => `/tmp/groups/${folder}`),
  resolveGroupIpcPath: vi.fn((folder: string) => `/tmp/groups/${folder}/queue`),
}));

vi.mock('./sender-allowlist.js', () => ({
  loadSenderAllowlist: vi
    .fn()
    .mockReturnValue({ groups: {}, logDenied: false }),
  isSenderAllowed: vi.fn().mockReturnValue(true),
  isTriggerAllowed: vi.fn().mockReturnValue(true),
  shouldDropMessage: vi.fn().mockReturnValue(false),
}));

vi.mock('./db.js', async () => {
  const actual = await vi.importActual<typeof import('./db.js')>('./db.js');
  return actual;
});

vi.mock('./migrate-sessions.js', () => ({
  migrateSessionDirs: vi.fn(),
}));

vi.mock('./remote-control.js', () => ({
  restoreRemoteControl: vi.fn(),
  startRemoteControl: vi.fn().mockResolvedValue(undefined),
  stopRemoteControl: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('./ipc.js', () => ({
  startIpcWatcher: vi.fn().mockReturnValue({ stop: vi.fn() }),
  _processQueueFile: vi.fn(),
}));

vi.mock('./task-scheduler.js', () => ({
  startSchedulerLoop: vi.fn().mockReturnValue({ stop: vi.fn() }),
}));

vi.mock('./channels/index.js', () => ({}));

vi.mock('./features/index.js', () => ({}));

vi.mock('./debug-query.js', () => ({
  sendDebugQuery: vi.fn().mockResolvedValue(undefined),
}));

// --- Helpers ---

import { runContainerAgent } from './container-runner.js';

const runContainerAgentMock = vi.mocked(runContainerAgent);

const MAIN_JID = 'main@g.us';
const OTHER_JID = 'group@g.us';

const MAIN_GROUP: RegisteredGroup = {
  name: 'Main',
  folder: 'discord_main',
  trigger: 'always',
  added_at: '2024-01-01T00:00:00.000Z',
  isMain: true,
};

const OTHER_GROUP: RegisteredGroup = {
  name: 'Other Group',
  folder: 'discord_other',
  trigger: '@Jarvis',
  added_at: '2024-01-01T00:00:00.000Z',
};

let sendMessageSpy: ReturnType<typeof vi.fn>;
let testChannel: Channel;

function storeTestMessage(
  overrides: Partial<NewMessage> & { chat_jid: string },
): NewMessage {
  const msg: NewMessage = {
    id: `msg-${Math.random().toString(36).slice(2, 8)}`,
    sender: 'user-123',
    sender_name: 'Shiven',
    content: 'Hello!',
    timestamp: new Date().toISOString(),
    is_from_me: false,
    ...overrides,
  };
  // Ensure chat row exists before storing message (FK constraint)
  storeChatMetadata(msg.chat_jid, msg.timestamp, 'Test Chat', 'discord', true);
  storeMessage(msg);
  return msg;
}

function mockContainerSuccess(text: string): void {
  runContainerAgentMock.mockImplementation(
    async (_group, _input, _register, onOutput) => {
      await onOutput?.({ status: 'success', result: text });
      return { status: 'success', result: text };
    },
  );
}

function mockContainerError(error = 'agent crashed'): void {
  runContainerAgentMock.mockImplementation(
    async (_group, _input, _register, onOutput) => {
      await onOutput?.({ status: 'error', result: null, error });
      return { status: 'error', result: null, error };
    },
  );
}

function mockContainerErrorAfterOutput(text: string): void {
  runContainerAgentMock.mockImplementation(
    async (_group, _input, _register, onOutput) => {
      // Sends output first, then errors
      await onOutput?.({ status: 'success', result: text });
      await onOutput?.({ status: 'error', result: null, error: 'late error' });
      return { status: 'error', result: null, error: 'late error' };
    },
  );
}

beforeEach(() => {
  _initTestDatabase();
  runContainerAgentMock.mockReset();

  sendMessageSpy = vi.fn().mockResolvedValue(undefined);

  testChannel = {
    name: 'discord',
    connect: vi.fn().mockResolvedValue(undefined) as Channel['connect'],
    disconnect: vi.fn().mockResolvedValue(undefined) as Channel['disconnect'],
    isConnected: vi.fn().mockReturnValue(true) as Channel['isConnected'],
    ownsJid: vi.fn().mockReturnValue(true) as Channel['ownsJid'],
    sendMessage: sendMessageSpy as Channel['sendMessage'],
    setTyping: vi.fn().mockResolvedValue(undefined) as Channel['setTyping'],
    setCurrentThreadContext: vi.fn() as Channel['setCurrentThreadContext'],
  };

  _addTestChannel(testChannel);
  _setRegisteredGroups({});
});

afterEach(() => {
  _clearTestChannels();
});

// --- Tests ---

describe('processGroupMessages — main group (no trigger)', () => {
  it('returns true immediately when no unprocessed messages', async () => {
    setRegisteredGroup(MAIN_JID, MAIN_GROUP);
    _setRegisteredGroups({ [MAIN_JID]: MAIN_GROUP });

    const result = await _processGroupMessagesForTest(MAIN_JID);

    expect(result).toBe(true);
    expect(runContainerAgentMock).not.toHaveBeenCalled();
  });

  it('calls container and sends response for unprocessed messages', async () => {
    setRegisteredGroup(MAIN_JID, MAIN_GROUP);
    _setRegisteredGroups({ [MAIN_JID]: MAIN_GROUP });

    const msg = storeTestMessage({
      chat_jid: MAIN_JID,
      content: 'What time is it?',
    });

    mockContainerSuccess('It is 3pm.');

    const result = await _processGroupMessagesForTest(MAIN_JID);

    expect(result).toBe(true);
    expect(runContainerAgentMock).toHaveBeenCalledOnce();
    expect(sendMessageSpy).toHaveBeenCalledWith(
      MAIN_JID,
      'It is 3pm.',
      undefined,
    );
  });

  it('marks messages processed before running container', async () => {
    setRegisteredGroup(MAIN_JID, MAIN_GROUP);
    _setRegisteredGroups({ [MAIN_JID]: MAIN_GROUP });

    const msg = storeTestMessage({ chat_jid: MAIN_JID, content: 'Hello!' });

    // Capture unprocessed count at the time the container runs
    let unprocessedDuringRun = -1;
    runContainerAgentMock.mockImplementation(async () => {
      unprocessedDuringRun = getUnprocessedMessages(
        MAIN_JID,
        'Jarvis',
        10,
        null,
      ).length;
      return { status: 'success', result: 'Hi!' };
    });

    await _processGroupMessagesForTest(MAIN_JID);

    // Messages should already be marked processed before container ran
    expect(unprocessedDuringRun).toBe(0);
  });

  it('strips <internal> tags from agent output', async () => {
    setRegisteredGroup(MAIN_JID, MAIN_GROUP);
    _setRegisteredGroups({ [MAIN_JID]: MAIN_GROUP });

    const msg = storeTestMessage({
      chat_jid: MAIN_JID,
      content: 'Tell me a secret.',
    });

    mockContainerSuccess(
      '<internal>Thinking about this...</internal>\nHere is the answer.',
    );

    await _processGroupMessagesForTest(MAIN_JID);

    expect(sendMessageSpy).toHaveBeenCalledWith(
      MAIN_JID,
      'Here is the answer.',
      undefined,
    );
  });

  it('does not call sendMessage when output is only internal tags', async () => {
    setRegisteredGroup(MAIN_JID, MAIN_GROUP);
    _setRegisteredGroups({ [MAIN_JID]: MAIN_GROUP });

    const msg = storeTestMessage({ chat_jid: MAIN_JID, content: 'Ping.' });

    mockContainerSuccess('<internal>Just thinking, nothing to say.</internal>');

    await _processGroupMessagesForTest(MAIN_JID);

    expect(sendMessageSpy).not.toHaveBeenCalled();
  });
});

describe('processGroupMessages — non-main group trigger check', () => {
  it('marks messages processed without running container when no trigger', async () => {
    setRegisteredGroup(OTHER_JID, OTHER_GROUP);
    _setRegisteredGroups({ [OTHER_JID]: OTHER_GROUP });

    const msg = storeTestMessage({
      chat_jid: OTHER_JID,
      content: 'Just chatting, no mention.',
    });

    const result = await _processGroupMessagesForTest(OTHER_JID);

    expect(result).toBe(true);
    expect(runContainerAgentMock).not.toHaveBeenCalled();
    // Messages should now be processed (no re-processing loop)
    const remaining = getUnprocessedMessages(OTHER_JID, 'Jarvis', 10, null);
    expect(remaining).toHaveLength(0);
  });

  it('runs container when trigger present', async () => {
    setRegisteredGroup(OTHER_JID, OTHER_GROUP);
    _setRegisteredGroups({ [OTHER_JID]: OTHER_GROUP });

    const msg = storeTestMessage({
      chat_jid: OTHER_JID,
      content: '@Jarvis what is the weather?',
    });

    mockContainerSuccess('Sunny and warm!');

    const result = await _processGroupMessagesForTest(OTHER_JID);

    expect(result).toBe(true);
    expect(runContainerAgentMock).toHaveBeenCalledOnce();
    expect(sendMessageSpy).toHaveBeenCalledWith(
      OTHER_JID,
      'Sunny and warm!',
      undefined,
    );
  });

  it('runs container when group has requiresTrigger: false', async () => {
    const noTriggerGroup: RegisteredGroup = {
      ...OTHER_GROUP,
      requiresTrigger: false,
    };
    setRegisteredGroup(OTHER_JID, noTriggerGroup);
    _setRegisteredGroups({ [OTHER_JID]: noTriggerGroup });

    const msg = storeTestMessage({
      chat_jid: OTHER_JID,
      content: 'No trigger needed.',
    });

    mockContainerSuccess('Got it!');

    const result = await _processGroupMessagesForTest(OTHER_JID);

    expect(result).toBe(true);
    expect(runContainerAgentMock).toHaveBeenCalledOnce();
  });
});

describe('processGroupMessages — error handling', () => {
  it('returns false and rolls back messages when container errors with no output', async () => {
    setRegisteredGroup(MAIN_JID, MAIN_GROUP);
    _setRegisteredGroups({ [MAIN_JID]: MAIN_GROUP });

    const msg = storeTestMessage({
      chat_jid: MAIN_JID,
      content: 'Do something.',
    });

    mockContainerError('container crashed');

    const result = await _processGroupMessagesForTest(MAIN_JID);

    expect(result).toBe(false);
    expect(sendMessageSpy).not.toHaveBeenCalled();
    // Messages should be rolled back to unprocessed for retry
    const remaining = getUnprocessedMessages(MAIN_JID, 'Jarvis', 10, null);
    expect(remaining).toHaveLength(1);
  });

  it('returns true and keeps messages processed when container errors after sending output', async () => {
    setRegisteredGroup(MAIN_JID, MAIN_GROUP);
    _setRegisteredGroups({ [MAIN_JID]: MAIN_GROUP });

    const msg = storeTestMessage({ chat_jid: MAIN_JID, content: 'Long task.' });

    mockContainerErrorAfterOutput('Partial result before crash.');

    const result = await _processGroupMessagesForTest(MAIN_JID);

    // Returns true — user got output, don't duplicate
    expect(result).toBe(true);
    expect(sendMessageSpy).toHaveBeenCalledWith(
      MAIN_JID,
      'Partial result before crash.',
      undefined,
    );
    // Messages stay processed — no re-send
    const remaining = getUnprocessedMessages(MAIN_JID, 'Jarvis', 10, null);
    expect(remaining).toHaveLength(0);
  });
});

describe('processGroupMessages — unknown group', () => {
  it('returns true without processing when group is not registered', async () => {
    // Don't register the JID
    _setRegisteredGroups({});

    const msg = storeTestMessage({
      chat_jid: 'unknown@g.us',
      content: 'Hello!',
    });

    const result = await _processGroupMessagesForTest('unknown@g.us');

    expect(result).toBe(true);
    expect(runContainerAgentMock).not.toHaveBeenCalled();
  });
});

describe('processGroupMessages — thread context routing', () => {
  it('passes threadId to container for thread context messages', async () => {
    setRegisteredGroup(MAIN_JID, MAIN_GROUP);
    _setRegisteredGroups({ [MAIN_JID]: MAIN_GROUP });

    // Store message with a thread context ID
    const msg = storeTestMessage({
      chat_jid: MAIN_JID,
      content: 'Reply in thread.',
      thread_context_id: 42,
    });

    mockContainerSuccess('Thread reply!');

    await _processGroupMessagesForTest(MAIN_JID, 'ctx-42');

    expect(runContainerAgentMock).toHaveBeenCalledOnce();
    const callArgs = runContainerAgentMock.mock.calls[0];
    // threadId should be passed in the container input
    expect(callArgs[1].threadId).toBe('ctx-42');
  });
});
