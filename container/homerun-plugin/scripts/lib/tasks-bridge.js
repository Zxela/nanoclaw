/**
 * tasks-bridge.js — PSEUDOCODE REFERENCE (not executable)
 *
 * Documents the two-pass algorithm the team-lead skill uses to convert
 * homerun tasks.json into native Claude Code tasks with DAG dependencies.
 *
 * Functions like TaskCreate(), TaskUpdate(), TaskList(), readFile(), and
 * writeFile() are Claude Code agent-context APIs — they do NOT exist as
 * Node.js functions. The team-lead agent implements this logic inline.
 *
 * This file exists as documentation, not as a runnable module.
 */

/**
 * Convert homerun tasks to native Claude Code tasks with DAG dependencies.
 *
 * Two-pass approach:
 *   Pass 1: Create all tasks (without dependencies) to get native IDs
 *   Pass 2: Add dependency edges using the ID mapping
 *
 * @param {Array} homerunTasks - Tasks from docs/tasks.json
 * @returns {Object} mapping from homerun task IDs to native task IDs
 */
function convertToNativeTasks(homerunTasks) {
  const nativeTaskIdMap = {};

  // Pass 1: Create all tasks without dependencies
  for (const task of homerunTasks) {
    const nativeTask = TaskCreate({
      title: `[${task.id}] ${task.title}`,
      description: formatTaskDescription(task),
      status: task.status === "completed" ? "completed" : "pending"
    });

    nativeTaskIdMap[task.id] = nativeTask.id;
  }

  // Pass 2: Add DAG dependency edges
  for (const task of homerunTasks) {
    if (task.depends_on && task.depends_on.length > 0) {
      const blockers = task.depends_on
        .map(dep => nativeTaskIdMap[dep])
        .filter(Boolean); // Skip any unmapped dependencies

      if (blockers.length > 0) {
        TaskUpdate({
          id: nativeTaskIdMap[task.id],
          addBlockedBy: blockers
        });
      }
    }
  }

  return nativeTaskIdMap;
}

/**
 * Format a homerun task into a native task description.
 *
 * @param {Object} task - A homerun task object
 * @returns {string} Formatted description for native task
 */
function formatTaskDescription(task) {
  const parts = [];

  parts.push(`**Objective:** ${task.objective}`);

  if (task.acceptance_criteria && task.acceptance_criteria.length > 0) {
    parts.push('\n**Acceptance Criteria:**');
    for (const criterion of task.acceptance_criteria) {
      parts.push(`- ${criterion}`);
    }
  }

  if (task.test_hints && task.test_hints.length > 0) {
    parts.push('\n**Test Hints:**');
    for (const hint of task.test_hints) {
      parts.push(`- ${hint}`);
    }
  }

  if (task.type) {
    parts.push(`\n**Type:** ${task.type}`);
  }

  if (task.linked_stories && task.linked_stories.length > 0) {
    parts.push(`**Stories:** ${task.linked_stories.join(', ')}`);
  }

  if (task.linked_criteria && task.linked_criteria.length > 0) {
    parts.push(`**Criteria:** ${task.linked_criteria.join(', ')}`);
  }

  return parts.join('\n');
}

/**
 * Sync native task status back to homerun tasks.json.
 *
 * Called periodically by the team-lead to keep both systems in sync.
 *
 * @param {Object} nativeTaskIdMap - Mapping from homerun to native IDs
 * @param {string} tasksFilePath - Path to docs/tasks.json
 */
function syncNativeToHomerun(nativeTaskIdMap, tasksFilePath) {
  const taskList = TaskList();
  const homerunTasks = JSON.parse(readFile(tasksFilePath));

  for (const [homerunId, nativeId] of Object.entries(nativeTaskIdMap)) {
    const nativeTask = taskList.find(t => t.id === nativeId);
    if (!nativeTask) continue;

    const homerunTask = homerunTasks.tasks.find(t => t.id === homerunId);
    if (!homerunTask) continue;

    // Sync status: native → homerun
    if (nativeTask.status === "completed" && homerunTask.status !== "completed") {
      homerunTask.status = "completed";
      homerunTask.completed_at = new Date().toISOString();
    }
  }

  writeFile(tasksFilePath, JSON.stringify(homerunTasks, null, 2));
}

// NOT a real module — pseudocode reference only.
// See team-lead/SKILL.md for the actual implementation instructions.
