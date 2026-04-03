---
name: discovery
description: "[inherit] Refine ideas into PRD, ADR, Technical Design, and Wireframes through structured dialogue"
color: yellow
---

# Discovery Skill

## Reference Materials

- State schema & initialization: `references/state-schema.md`
- Validation gates: `references/validation-gates.md`
- Scale determination & doc segregation: `references/scale-determination.md`
- Document templates: `templates/*.md`
- Dialogue examples: `cookbooks/discovery-dialogue-examples.md`
- Signal contracts: `references/signal-contracts.json`
- Context engineering: `references/context-engineering.md`

## Overview

Guide the user from a rough idea to specification documents through codebase-informed dialogue. Discovery starts by deeply understanding the existing codebase, then fills knowledge gaps through targeted conversation — never asking what the code already answers.

In auto mode (`config.auto_mode: true`), dialogue is skipped entirely — specs are generated from the initial prompt and codebase analysis.

---

## Input Schema

The `/create` command provides input as a JSON object:

```json
{
  "prompt": "User's description of what to build",
  "config": {
    "auto_mode": false,
    "max_dialogue_turns": 20,
    "dialogue_warning_at": 15,
    "retries": { "same_agent": 2, "fresh_agent": 1 }
  },
  "project_root": "/path/to/project"
}
```

## Output: DISCOVERY_COMPLETE Signal

See `references/signal-contracts.json` for the full envelope schema. The signal includes `spec_paths`, `session_id`, `worktree_path`, and `dialogue_stats`.

---

## Process

### 1. Codebase Analysis (Silent)

Before engaging the user, build a deep understanding of the project. This analysis directly shapes which questions you ask, which you skip, and what you can state as findings rather than ask about.

**What to analyze:**

1. **Project conventions** — Read CLAUDE.md, contributing guides, README
2. **Tech stack** — Parse package.json, pyproject.toml, Cargo.toml, go.mod, etc.
3. **Architecture** — Scan directory structure, identify layers (routes, services, models, tests)
4. **Existing patterns** — How are similar features structured? What conventions are followed?
5. **Related functionality** — Does anything related to the requested feature already exist?
6. **Testing conventions** — What test framework, where are tests, what patterns are used?
7. **Recent activity** — `git log --oneline -10` to understand current development context

**Form hypotheses about:**
- What files/modules would need to change (→ preliminary scale estimate)
- What patterns to follow (→ informs architectural decisions)
- What constraints exist from the codebase (→ state these rather than ask)
- What the user likely wants based on existing code structure

**Saturation check:** If 3 consecutive sources (files, grep results, git log) yield no new information, stop exploring.

---

### 1.5. Early Scope Assessment

After codebase analysis but **before** asking clarifying questions, scan the initial request for signals of multiple independent subsystems:

1. **Scan for scope breadth:**
   - Count distinct user types/personas mentioned
   - Count separate integration points or external systems
   - Count architectural layers implied (data, API, UI, admin, etc.)
   - Watch for independence keywords: "and also", "additionally", "separate", "plus"

2. **If 3+ independent areas detected**, raise BEFORE detailed questions:

   > "I see this request spans multiple independent areas:
   > - [Area A] (subsystem description)
   > - [Area B] (subsystem description)
   > - [Area C] (subsystem description)
   >
   > For focused implementation, I'd recommend:
   > A) Start with [core area] — ship it, then tackle the rest as phase 2
   > B) Build all areas in priority order: [suggested sequence]
   > C) A different split — tell me what makes sense for your situation"

3. **Only proceed with detailed dialogue after scope is agreed upon.** If the request is focused (fewer than 3 independent areas), skip this step and move directly to dialogue.

---

### 2. Adaptive Dialogue

The dialogue should feel like a conversation with a senior engineer who has studied the codebase — not a requirements questionnaire going through a fixed checklist.

**Auto mode:** Skip dialogue entirely. Use codebase analysis + initial prompt to infer all answers. Set `dialogue_stats.auto_completed: true` and jump to Step 3.

**Interactive mode:**

#### Opening: Present Your Understanding

Start by sharing what you learned from the codebase. Then use `AskUserQuestion` for your first batch of clarifying questions:

```
Based on your project, I can see:
- [tech stack, framework, relevant patterns]
- [existing related functionality]
- [architectural constraints or conventions]

Here's my understanding of what you want to build: [synthesis of prompt + codebase context]
```

Then immediately use `AskUserQuestion` for the first round of clarifications — don't just print text questions. This gives the user a structured interface to respond through.

#### Using AskUserQuestion for Dialogue

**Always use `AskUserQuestion` when asking the user questions.** This presents a structured UI with clickable options instead of text-based Q&A. It reduces cognitive load and speeds up the dialogue.

Guidelines for effective questions:
- **Batch 1-4 related questions per call** — group logically (e.g., scope + boundaries together)
- **2-4 options per question** — the system auto-adds "Other" for custom text input
- **Use `multiSelect: true`** when choices aren't mutually exclusive (e.g., "which constraints apply?")
- **Short headers** (max 12 chars) — e.g., "Scope", "Errors", "Auth method"
- **Descriptive options** — label + description, not just a bare label
- Avoid redundant questions that the codebase already answers

**Example — opening questions for a feature request:**

```json
{
  "questions": [
    {
      "question": "What scope level fits for the initial implementation?",
      "header": "Scope",
      "options": [
        { "label": "Minimal", "description": "Core functionality only — bare essentials to be useful" },
        { "label": "Standard", "description": "Core plus common use cases and basic error handling" },
        { "label": "Comprehensive", "description": "Full feature set including edge cases and polish" }
      ],
      "multiSelect": false
    },
    {
      "question": "What should happen when errors occur?",
      "header": "Error handling",
      "options": [
        { "label": "Fail fast", "description": "Show clear error messages, don't try to recover" },
        { "label": "Graceful degradation", "description": "Fall back to reduced functionality when possible" },
        { "label": "Retry with backoff", "description": "Automatically retry transient failures" }
      ],
      "multiSelect": false
    }
  ]
}
```

**Example — constraints discovery:**

```json
{
  "questions": [
    {
      "question": "Which constraints apply to this feature?",
      "header": "Constraints",
      "options": [
        { "label": "Performance targets", "description": "Specific latency, throughput, or resource requirements" },
        { "label": "Security/compliance", "description": "Auth, encryption, audit logging, or regulatory needs" },
        { "label": "Backward compatibility", "description": "Must not break existing API consumers or data" },
        { "label": "None significant", "description": "No special constraints beyond standard practices" }
      ],
      "multiSelect": true
    }
  ]
}
```

#### What to Ask vs. What to State

**Ask only what the codebase can't tell you:**
- Business motivation (why this feature, why now)
- Scope boundaries (what's in v1 vs. later)
- User-facing behavior preferences (when alternatives exist)
- Edge case priorities (which error scenarios matter most)

**State findings and confirm — don't ask:**
- Instead of: "What database do you use?"
- Say: "I see you're using PostgreSQL with Prisma. I'll follow your existing model patterns."
- Then use `AskUserQuestion` only for the genuine unknowns.

#### Progressing the Dialogue

- Acknowledge previous answers before asking follow-ups
- Build visible connections between answers
- Summarize understanding every 2-3 exchanges
- Track dialogue turns (warn at 15, hard limit at 20)

Mark a topic complete when:
- You have enough information to write that section of the spec
- User signals they're done (brief answer, "that's fine", etc.)
- No new information emerges after a follow-up

**Turn limits:**
- At warning threshold (default 15): Use `AskUserQuestion` to ask whether to generate specs now or continue refining
- At max threshold (default 20): Generate specs with collected information. The user can refine documents directly.

#### Scale Estimation

After understanding scope, estimate the change size. This determines which documents to generate and how deep the dialogue goes.

| Scale | Files | Documents | Dialogue |
|-------|-------|-----------|----------|
| **Small** (1-2) | TECHNICAL_DESIGN only | 5-8 turns total |
| **Medium** (3-5) | PRD + TECHNICAL_DESIGN | 10-15 turns |
| **Large** (6+) | PRD + ADR + TECHNICAL_DESIGN + WIREFRAMES | 15-20 turns |

Always generate ADR if any trigger is detected (type change in 3+ locations, data flow change, architecture change, external dependency, complex logic with 3+ states). See `references/scale-determination.md` for the full matrix.

Inform the user of the scale assessment. If they think it's bigger or smaller than estimated, adjust.

#### Acceptance Criteria Quality (EARS Format)

Every acceptance criterion must use **EARS format** (Easy Approach to Requirements Syntax) and describe an **observable outcome** that a developer can write a test for. The litmus test: "Can I verify this passed or failed without asking a follow-up question?"

**EARS patterns — use these:**

| Pattern | When to Use | Template |
|---------|-------------|----------|
| **Event-driven** | Something triggers a response | **When** [trigger], the system **shall** [response] |
| **State-driven** | Behavior depends on system state | **While** [state], the system **shall** [behavior] |
| **Conditional** | Behavior depends on a condition | **If** [condition], **then** the system **shall** [response] |
| **Unconditional** | Always true, no trigger | The system **shall** [behavior] |

**Good — EARS format, observable, testable:**
- "When user submits the form with an invalid email, the system shall display 'Please enter a valid email address' below the email field"
- "The API shall respond with 200 and the created user object within 500ms"
- "If the session token is expired, then the system shall redirect to /login and clear local storage"
- "While the user is unauthenticated, the system shall return 401 for all /api/* requests"

**Bad — vague, subjective:**
- "Should be user-friendly" → ask: "What specific action should be easy?"
- "Should work correctly" → ask: "What does correct behavior look like?"
- "Must be fast" → ask: "What response time is acceptable?"
- "Handle errors properly" → ask: "What should the user see when X fails?"

When a user provides a vague criterion, rewrite it into EARS format:

```
That criterion might be hard to test as written. Let me suggest an EARS rewrite:

Instead of: "[vague criterion]"
Something like: "When [trigger], the system shall [specific observable outcome]"

Would that capture what you mean?
```

---

### 3. Document Generation

#### Create Worktree and Storage

```bash
# Generate session ID
SESSION_UUID=$(cat /proc/sys/kernel/random/uuid | cut -c1-8)
FEATURE_SLUG=$(echo "{{FEATURE_NAME}}" | tr '[:upper:]' '[:lower:]' | tr ' ' '-' | tr -cd 'a-z0-9-')
BRANCH_NAME="create/${FEATURE_SLUG}-${SESSION_UUID}"

# Paths
REPO_ROOT=$(git rev-parse --show-toplevel)
REPO_NAME=$(basename "$REPO_ROOT")
WORKTREE_PATH="${REPO_ROOT}/../${REPO_NAME}-create-${FEATURE_SLUG}-${SESSION_UUID}"
PROJECT_HASH=$(echo "$REPO_ROOT" | md5sum | cut -c1-8)
# IMPORTANT: Use $HOME, not ~ (tilde doesn't expand in all contexts)
HOMERUN_DOCS_DIR="${HOME}/.claude/homerun/${PROJECT_HASH}/${FEATURE_SLUG}-${SESSION_UUID}"

# Create worktree and docs directory
git branch "$BRANCH_NAME"
git worktree add "$WORKTREE_PATH" "$BRANCH_NAME"
mkdir -p "$HOMERUN_DOCS_DIR"
mkdir -p "${WORKTREE_PATH}/docs"
```

#### Write Specification Documents

Use templates from `templates/*.md` as starting points. Generate only the documents appropriate for the scale (see `references/scale-determination.md`).

**Document segregation — strict boundaries:**
- **PRD** = business value ONLY (problem, FR/NFR requirements, user stories, goals — never implementation details)
- **ADR** = decision rationale ONLY (options, tradeoffs, consequences — never "how to implement")
- **TECHNICAL_DESIGN** = implementation ONLY (architecture, data models, API contracts, NFR implementation approach — never "why")
- **WIREFRAMES** = user interface ONLY (layouts, flows, states — skip for CLI/API/library projects)

**Requirements classification:**
- **Functional Requirements (FR)** go in PRD, prioritized by MoSCoW (Must/Should/Could/Won't)
- **Non-Functional Requirements (NFR)** have quantified targets in PRD, implementation approach in TECHNICAL_DESIGN
- Each FR must have an EARS-format acceptance criterion
- Each NFR must have a measurable target — omit the category if no target exists

Cross-reference between documents instead of duplicating content.

**Content quality principles:**

1. **Ground everything in the codebase.** Reference actual files, patterns, and conventions from THIS project. Don't write generic boilerplate specs.
2. **ACs must be testable.** Every acceptance criterion describes an observable outcome.
3. **Non-scope is as important as scope.** In TECHNICAL_DESIGN, explicitly list what you're NOT changing. Include a Change Impact Map:
   - *Direct Impact* — files/modules being modified
   - *Indirect Impact* — files that import/use changed code (verify no breakage)
   - *No Ripple Effect* — features explicitly confirmed unaffected
4. **Right-size the detail.** Small features get a focused TECHNICAL_DESIGN with no empty sections. Large features get the full document set. Never pad with boilerplate.
5. **Omit inapplicable sections.** If the template has a section that doesn't apply (e.g., Migration Plan for a greenfield feature), leave it out entirely rather than writing "N/A".

Write documents to `$HOMERUN_DOCS_DIR/`.

#### Initialize State

See `references/state-schema.md` for the complete schema, field descriptions, and scale-based initialization examples.

Key fields to populate:
- `session_id`, `branch`, `worktree`, `feature`
- `homerun_docs_dir` and `spec_paths` — fully expanded absolute paths, never `~` or `$HOME`
- `scale` and `scale_details`
- `traceability` — user stories, acceptance criteria, ADR decisions, non-goals
- `config` — auto_mode, retries from input
- `dialogue_state` — turns completed, topics covered

---

### 4. Validation & Transition

**Auto mode:** Skip interactive validation. Run the automated validation gates, log any warnings, and proceed directly.

**Interactive mode:** Present the generated documents for review — don't chunk them into 200-word pieces. The documents are already in files the user can read.

```
I've generated the specification documents:

- TECHNICAL_DESIGN.md — [1-sentence summary]
- PRD.md — [1-sentence summary] (if generated)
- ADR.md — [1-sentence summary] (if generated)

The docs are at: [homerun_docs_dir path]

Please review and let me know if anything needs adjustment, or confirm to proceed.
```

Use `AskUserQuestion` to get the user's verdict:

```json
{
  "questions": [{
    "question": "How do the generated specs look?",
    "header": "Spec review",
    "options": [
      { "label": "Looks good", "description": "Proceed to the next phase" },
      { "label": "Minor edits needed", "description": "I'll describe what to change" },
      { "label": "Major revision needed", "description": "Let's revisit some of the requirements" }
    ],
    "multiSelect": false
  }]
}
```

Handle responses:
- **Looks good** → proceed to transition
- **Minor edits** → apply changes, re-present
- **Major revision** → return to dialogue for the affected topic

#### Automated Validation Gates

Before transitioning, run the validation checks from `references/validation-gates.md`:
- **VALIDATION_FAILED:** Do not transition. Present failures, return to dialogue.
- **VALIDATION_WARNING (interactive):** Present warnings, ask whether to address or proceed.
- **VALIDATION_WARNING (auto):** Log and proceed.

#### Commit and Transition

```bash
cd "$WORKTREE_PATH"
git add state.json
git commit -m "chore: initialize ${FEATURE_SLUG} workflow

Session ID: ${SESSION_UUID}
Docs location: ${HOMERUN_DOCS_DIR}

Generated by /create workflow discovery phase"
```

Update phase to `"spec_review"` and commit:

```bash
jq '.phase = "spec_review"' state.json > tmp.json && mv tmp.json state.json
git add state.json
git commit -m "chore: transition to spec review phase"
```

Output the `DISCOVERY_COMPLETE` signal and return. **Do NOT spawn the next phase.**

```json
{
  "signal": "DISCOVERY_COMPLETE",
  "timestamp": "<ISO8601>",
  "source": { "skill": "homerun:discovery" },
  "payload": {
    "session_id": "...",
    "worktree_path": "...",
    "branch": "...",
    "homerun_docs_dir": "...",
    "spec_paths": { "prd": "...", "adr": "...", "technical_design": "..." },
    "dialogue_stats": {
      "total_turns": 8,
      "topics_covered": ["purpose", "scope", "edge_cases"],
      "auto_completed": false
    }
  },
  "envelope_version": "1.0.0"
}
```

---

## Exit Criteria

- [ ] Codebase analyzed for conventions, patterns, and related functionality
- [ ] Knowledge gaps addressed through dialogue (or auto mode used)
- [ ] Documents generated at appropriate scale (Small/Medium/Large)
- [ ] All acceptance criteria describe observable, testable outcomes
- [ ] Non-scope explicitly declared in TECHNICAL_DESIGN
- [ ] Git worktree created, state.json initialized
- [ ] Validation gates passed
- [ ] Phase set to `spec_review`
