# Discovery Question Reference

Quick reference for the discovery dialogue. Use `AskUserQuestion` for all user interaction — present questions through the structured UI with clickable options.

## Dialogue Approach

1. **Analyze the codebase first** — understand tech stack, architecture, patterns, and related code
2. **Present findings** — tell the user what you learned, state what's already clear
3. **Ask only gaps** — use `AskUserQuestion` for things the codebase can't tell you
4. **Batch 1-4 questions per call** — group related topics together

## Topics to Cover

Not a rigid checklist — skip topics the codebase already answers. Adapt based on the feature.

### Purpose & Goals
- What problem does this solve? Who benefits?
- What does success look like? (measurable outcomes)
- Why now? (context for prioritization)

### Scope & Boundaries
- What's in scope for v1? (minimal / standard / comprehensive)
- What's explicitly out of scope?
- What are you NOT changing? (non-scope declaration)

### Technical Preferences
- How should errors be handled? (fail fast / degrade / retry)
- Any specific integration requirements?
- Performance or security constraints beyond what the codebase implies?

### Edge Cases
- What are the boundary conditions?
- What happens when things go wrong?
- Which failure modes matter most?

## AskUserQuestion Patterns

### Scope level
```json
{
  "question": "What scope level fits for the initial implementation?",
  "header": "Scope",
  "options": [
    { "label": "Minimal", "description": "Core functionality only — bare essentials" },
    { "label": "Standard", "description": "Core plus common use cases" },
    { "label": "Comprehensive", "description": "Full feature set with edge cases" }
  ],
  "multiSelect": false
}
```

### Error handling
```json
{
  "question": "How should the feature handle errors?",
  "header": "Errors",
  "options": [
    { "label": "Fail fast", "description": "Clear error messages, no recovery attempts" },
    { "label": "Graceful degradation", "description": "Fall back to reduced functionality" },
    { "label": "Retry automatically", "description": "Retry transient failures with backoff" },
    { "label": "Depends on type", "description": "Different strategies for different error types" }
  ],
  "multiSelect": false
}
```

### Constraints (multi-select)
```json
{
  "question": "Which constraints apply to this feature?",
  "header": "Constraints",
  "options": [
    { "label": "Performance targets", "description": "Specific latency, throughput, or resource limits" },
    { "label": "Security/compliance", "description": "Auth, encryption, audit, or regulatory needs" },
    { "label": "Backward compat", "description": "Must not break existing consumers" },
    { "label": "None significant", "description": "Standard practices are sufficient" }
  ],
  "multiSelect": true
}
```

## Testable Acceptance Criteria

Every AC must describe an **observable outcome** verifiable by a test.

| Good (testable) | Bad (vague) |
|-----------------|-------------|
| "When user submits invalid email, system displays 'Please enter a valid email'" | "Should be user-friendly" |
| "API responds with 200 and created resource within 500ms" | "Must be fast" |
| "If session expired, redirect to /login and clear local storage" | "Handle errors properly" |
| "Failed login attempts rate-limited to 5 per minute per IP" | "Login should be secure" |

When a user provides a vague criterion, help them make it specific by asking what the observable outcome should be.

## Dialogue Limits

- Warn at 15 turns: ask whether to generate specs or continue
- Hard limit at 20 turns: generate specs with collected information
- Mark topic complete after enough info to write that spec section
- Small features: 5-8 turns total
- Medium features: 10-15 turns
- Large features: 15-20 turns
