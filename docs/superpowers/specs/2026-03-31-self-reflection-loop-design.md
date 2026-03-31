# Milestone 2: Self-Reflection Loop

The agent learns from its own actions, adapts to user constraints, and proactively schedules new work — with cost guardrails to prevent runaway spending.

## Problems Being Solved

1. **No feedback loop.** The agent creates PRs and skills but doesn't learn from outcomes. PRs you close without merging teach it nothing. It proposed 3 Alpaca skills despite the API being inaccessible in Canada — even though that constraint was documented in a different group's knowledge base.

2. **Cross-group knowledge isolation.** Constraints and lessons learned in one group (e.g., discord_general) aren't visible to the group that proposes improvements (discord_main/main). The Alpaca example: the decision doc exists in `discord_general/knowledge/decisions/` but the self-improvement task runs in the main group.

3. **Too conservative on proactive scheduling.** The agent has autonomy tiers but rarely creates new scheduled tasks on its own. It should be encouraged to schedule more, with guardrails.

4. **No cost guardrails.** Proactive scheduling without limits could lead to runaway API costs from too many concurrent containers.

## Design

### 1. PR Outcome Tracking

**What:** After each self-improvement or skill PR is closed (merged or rejected), the agent extracts lessons and stores them in a shared location.

**How:** The existing PR watcher (`src/pr-watcher.ts`) already polls for PR comments. Extend it to also detect PR closures (merged vs closed-without-merge). When a PR created by the agent is closed:

- **Merged:** Log as successful. Extract what worked (topic, approach, scope).
- **Closed without merge:** Log as rejected. Extract the close reason from comments or PR body. Store as a constraint/lesson.

Store outcomes in a new file: `groups/global/knowledge/pr-outcomes.md`. The global group is read-only mounted into all non-main containers at `/workspace/global/`, so all groups can see it. Main also reads global CLAUDE.md.

Format:
```markdown
## PR Outcomes

### Merged
- #55 skill: technical-analysis — accepted, useful skill pattern
- #58 skill-self-authoring + session fix — accepted

### Rejected
- #51 paper-trader (Alpaca) — CLOSED: Alpaca API not available in Canada. Don't propose US-only financial APIs.
- #54 portfolio-tracker (Alpaca) — CLOSED: Same constraint as #51.

### Lessons
- Check API geographic availability before proposing integrations
- User prefers focused, single-purpose skills over mega-skills
```

**Implementation:** Add a `pr_outcomes` section to the deep think loop's prompt. The think loop already runs every 4 hours and has access to `gh` CLI. It checks for recently closed PRs authored by the bot, reads close comments, and appends to `pr-outcomes.md`.

### 2. Shared Constraints File

**What:** A curated file of known user constraints, accessible to all groups.

**Where:** `groups/global/knowledge/constraints.md`

**Content:** Maintained by the agent (updated during deep think) and editable by the user. Contains things the agent has learned or been told:

```markdown
## Constraints

### Geographic
- User is in Vancouver, BC, Canada
- No US-only APIs (Alpaca, etc.)
- Prefer services with Canadian availability

### Cost
- Prefer free-tier services where possible
- Don't add paid API dependencies without asking

### Technical
- Container images are ephemeral — pip installs happen on every container start
- /workspace/project/ is read-only — changes go through PR workflow
```

**How it's used:** The self-improvement proposal task and skill-recommendation task prompts are updated to include: "Before proposing, check `/workspace/global/knowledge/constraints.md` for known limitations."

### 3. Task Count Cap

**What:** Limit the number of active scheduled tasks per group to prevent runaway scheduling.

**Implementation:** Add a `MAX_SCHEDULED_TASKS_PER_GROUP` config constant (default: 10). When the agent tries to create a new scheduled task via the `schedule_task` MCP tool, the host-side IPC handler checks the count of active tasks for that group. If at the limit, reject with an error message telling the agent to pause or cancel existing tasks first.

**Where:** `src/ipc.ts` (the `schedule_task` handler) and `src/config.ts` (new constant).

### 4. Tiered Approval for Expensive Operations

**What:** Cheap operations run freely. Expensive operations require reaching out to the user via Discord before executing.

**Tiers (extending existing autonomous-think framework):**

| Operation | Tier | Behavior |
|-----------|------|----------|
| Fast think loop check | 1 | Run freely |
| Deep think knowledge extraction | 1 | Run freely |
| Update knowledge base files | 1 | Run freely |
| Create one-shot task | 2 | Act + notify user |
| Create recurring task | 3 | **Ask first** via Discord message, wait for approval |
| Escalate to goal mode | 3 | **Ask first** via Discord message |
| Propose source code PR | 2 | Act + notify (existing behavior) |

**Implementation:** Update the `autonomous-think` skill to enforce these tiers. For Tier 3 operations, the agent sends a Discord message like:

> "I'd like to schedule a new recurring task: `{description}` running every `{interval}`. This will use container time on each run. Approve? (reply yes/no)"

The agent then waits for a response before proceeding. This uses the existing conversation mechanism — no new infrastructure needed.

### 5. Encourage Proactive Scheduling

**What:** Update the deep think loop and self-improvement prompts to actively look for scheduling opportunities.

**Prompt additions to the deep think loop:**

```
## Proactive Scheduling

After reviewing conversations and knowledge, consider:
- Are there recurring questions or tasks that should be automated?
- Are there monitoring tasks that would catch issues earlier?
- Are there data gathering tasks that would make future conversations more informed?

If you identify a good candidate, schedule it (respecting the task count cap and approval tiers).
Check constraints.md before proposing anything that depends on external services.
```

### 6. Surface Feedback from All Groups

**What:** The deep think loop in the main group should be able to see lessons learned across all groups, not just its own.

**How:** The global knowledge directory (`groups/global/`) is already shared. The fix is to ensure that when any group learns a constraint (like the Alpaca issue), it writes to `groups/global/knowledge/` rather than only its own `knowledge/decisions/` directory.

**Implementation:** Update the global CLAUDE.md to instruct agents: "When you learn a constraint that applies broadly (API limitations, user preferences, geographic restrictions), write it to `/workspace/global/knowledge/constraints.md` in addition to your local knowledge base."

## Files Changed

| File | Change |
|------|--------|
| `groups/global/knowledge/constraints.md` | New: shared constraints file |
| `groups/global/knowledge/pr-outcomes.md` | New: PR outcome tracking |
| `groups/global/CLAUDE.md` | Update: instruct agents to write broad constraints to global |
| `container/skills-catalog/local/autonomous-think/SKILL.md` | Update: add PR tracking, constraints checking, proactive scheduling, tier enforcement |
| `src/config.ts` | New constant: `MAX_SCHEDULED_TASKS_PER_GROUP` |
| `src/ipc.ts` | Update: enforce task count cap in `schedule_task` handler |

## What's NOT in Scope

- **Budget/dollar caps:** Deferred. Task count cap is the v1 cost guardrail.
- **Automated PR outcome detection:** v1 is manual — the deep think loop checks `gh pr list --state closed`. Webhook-based detection is future work.
- **Cross-group messaging:** Agents still can't message each other directly. They share knowledge via the global filesystem.
- **Self-editing CLAUDE.md:** Still Tier 4 (never). The agent can propose CLAUDE.md changes via PR but can't modify its own instructions directly.

## Success Criteria

1. Agent checks `constraints.md` before proposing skills or improvements — no more US-only API proposals
2. PR outcomes are tracked and inform future proposals
3. Task count cap prevents runaway scheduling (reject at limit with clear error)
4. Agent proactively schedules useful tasks within guardrails
5. New recurring tasks require user approval via Discord message
6. Constraints learned in one group are visible to all groups via global knowledge
