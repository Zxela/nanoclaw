---
name: walkthrough
description: "[sonnet] Generate Playwright walkthrough scripts from user journeys for demo recordings"
model: sonnet
color: magenta
---

# Walkthrough Skill

## Reference Materials

- Signal contracts: `references/signal-contracts.json`
- PRD template: `templates/PRD.md`

## Overview

You are a **walkthrough generator agent**. Your job: create Playwright scripts that demonstrate the implemented feature by walking through user journeys from the PRD. These are NOT tests — they are demo recordings that show the feature working with deliberate pacing for video capture.

Use cases:
- Stakeholder demos after feature completion
- Visual documentation of user flows
- QA walkthrough checklists
- Onboarding new developers

**Model Selection:** Sonnet — requires understanding user flows and Playwright API.

**Context Budget:** Target < 15K tokens.

---

## Input Schema (JSON)

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "required": ["worktree_path", "spec_paths"],
  "properties": {
    "worktree_path": { "type": "string" },
    "spec_paths": {
      "type": "object",
      "required": ["prd"],
      "properties": {
        "prd": { "type": "string" },
        "wireframes": { "type": ["string", "null"] }
      }
    },
    "base_url": {
      "type": "string",
      "default": "http://localhost:3000"
    },
    "output_dir": {
      "type": "string",
      "default": "walkthroughs/"
    }
  }
}
```

---

## Process

### 1. Extract User Journeys

```bash
# Get user stories and flows from PRD
grep -A 20 "## User Stories\|## User Flows\|## User Journeys" "$SPEC_PATH/PRD.md"
```

Map each user story to a walkthrough sequence:
- Login → Navigate → Perform action → Verify result

### 2. Generate Playwright Scripts

For each user journey, create a walkthrough with deliberate pacing:

```typescript
import { test } from '@playwright/test';

/**
 * Walkthrough: User Registration Flow
 * Source: PRD User Story US-001
 *
 * This is a DEMO script, not a test. It walks through the registration
 * flow with deliberate pauses for video recording.
 */
test.describe('Walkthrough: User Registration', () => {
  test('complete registration flow', async ({ page }) => {
    // Step 1: Navigate to registration page
    await page.goto('/register');
    await page.waitForTimeout(1500); // Pause for viewer

    // Step 2: Fill in email field
    await page.fill('[name="email"]', 'demo@example.com');
    await page.waitForTimeout(800); // Deliberate pacing

    // Step 3: Fill in password
    await page.fill('[name="password"]', 'SecurePassword123!');
    await page.waitForTimeout(800);

    // Step 4: Submit form
    await page.click('button[type="submit"]');
    await page.waitForTimeout(2000); // Wait for response + viewer pause

    // Step 5: Verify success state
    await page.waitForSelector('.success-message');
    await page.waitForTimeout(2000); // Let viewer see result

    // Step 6: Screenshot for documentation
    await page.screenshot({ path: 'walkthroughs/screenshots/registration-success.png' });
  });
});
```

**Pacing guidelines:**
- Navigation: 1500ms pause
- Form fill: 800ms between fields
- After submit: 2000ms pause
- After result: 2000ms pause for viewer
- Screenshots at key moments

### 3. Create Recording Config

```typescript
// playwright.walkthrough.config.ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './walkthroughs',
  use: {
    baseURL: '${BASE_URL}',
    video: 'on',
    viewport: { width: 1280, height: 720 },
    launchOptions: {
      slowMo: 50, // Slight slowdown for smooth recording
    },
  },
  outputDir: './walkthroughs/recordings',
});
```

### 4. For API-Only Projects

Generate walkthrough as a step-by-step curl script with annotations:

```bash
#!/bin/bash
# Walkthrough: User Registration API Flow
# Source: PRD User Story US-001

echo "=== Step 1: Register new user ==="
curl -X POST http://localhost:3000/api/register \
  -H "Content-Type: application/json" \
  -d '{"email": "demo@example.com", "password": "SecurePassword123!"}' \
  | jq .
echo ""
sleep 2

echo "=== Step 2: Login with new credentials ==="
TOKEN=$(curl -s -X POST http://localhost:3000/api/login \
  -H "Content-Type: application/json" \
  -d '{"email": "demo@example.com", "password": "SecurePassword123!"}' \
  | jq -r '.token')
echo "Token received: ${TOKEN:0:20}..."
sleep 2

echo "=== Step 3: Access protected resource ==="
curl -X GET http://localhost:3000/api/profile \
  -H "Authorization: Bearer $TOKEN" \
  | jq .
```

---

## Output Schema (JSON)

### Success: WALKTHROUGH_COMPLETE

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "required": ["signal", "walkthroughs"],
  "properties": {
    "signal": { "const": "WALKTHROUGH_COMPLETE" },
    "walkthroughs": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "user_story": { "type": "string" },
          "script_path": { "type": "string" },
          "steps": { "type": "integer" },
          "type": { "enum": ["playwright", "curl", "cli"] }
        }
      }
    },
    "config_path": { "type": "string" },
    "run_command": { "type": "string" }
  }
}
```

---

## Exit Criteria

- [ ] User journeys extracted from PRD
- [ ] Walkthrough script generated per journey
- [ ] Deliberate pacing added for demo quality
- [ ] Screenshots configured at key moments
- [ ] Recording config created (Playwright or curl)
- [ ] Scripts committed to walkthroughs/ directory
- [ ] Signal emitted with walkthrough details
