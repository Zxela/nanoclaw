---
name: notify-dev-complete
description: Send Telegram notification when development work is completed. Use as final step in coding workflows to notify user that the task is done and ready for review.
---

# Development Complete Notification

This skill sends a Telegram notification when development work is completed, providing a summary of what was accomplished and any next steps.

## When to Use

Use this skill as the **final step** in development workflows when:
- You've completed implementing a feature or fixing a bug
- Code changes have been made and tested
- The user should be notified that the work is ready for review
- You want to provide a clean summary of what was accomplished

## Prerequisites

Telegram channel must be configured in NanoClaw. If not set up, run `/add-telegram` first.

## Implementation

### 1. Check Telegram Setup

First, verify if Telegram is configured as a channel:

```bash
# Check if Telegram channel exists
ls -la src/channels/telegram.ts
```

If Telegram is not set up, guide the user to run `/add-telegram` skill first.

### 2. Determine Notification Method

**Option A: If Telegram channel is configured**
- Use the existing channel infrastructure to send notifications
- Get the main group JID for the user
- Send formatted message via router

**Option B: If Telegram not configured as channel**
- Suggest setting up Telegram first: `/add-telegram`
- Alternatively, provide notification in current chat interface
- Offer to help set up Telegram for future notifications

### 3. Gather Summary Information

Collect key details about the completed work:
- What was implemented/fixed
- Files that were created/modified
- Any testing performed
- Next steps or recommendations
- Any important notes or considerations

### 4. Format Notification Message

Create a concise but informative message:

```
✅ Development Complete

Task: [Brief description of what was requested]

Changes Made:
• [Key changes, file modifications, etc.]
• [Testing done]
• [Any important notes]

Status: Ready for review

Next Steps: [Any recommended actions]

Completed at: [timestamp]
```

### 5. Send Notification

**If Telegram is available:**

Use NanoClaw's routing system to send the message:

```typescript
import { routeOutbound } from '../router.js';

const message = formatCompletionMessage(summaryData);
await routeOutbound(channels, userMainGroupJid, message);
```

**If Telegram not available:**

Provide thorough summary in current chat and suggest Telegram setup for future notifications.

### 6. Confirmation

Always provide confirmation and summary in the current interface, regardless of whether external notification was sent.

## Usage Pattern

### First Time Setup
1. Check if Telegram is configured: `ls src/channels/telegram.ts`
2. If not found: Run `/add-telegram` to set up Telegram channel
3. Test the notification system
4. Use skill for future completion notifications

### Regular Usage
1. Complete development work
2. Run final tests/validation  
3. Invoke `/notify-dev-complete "Summary of what was accomplished"`
4. If Telegram configured: User receives notification on Telegram
5. Always receive confirmation and summary in current chat

### Manual Trigger
User can invoke this skill with:
- `/notify-dev-complete` - Basic completion notification
- `/notify-dev-complete "Custom message"` - With specific summary
- Or simply say "notify me that development is complete" in conversation

## Configuration

The skill respects Telegram channel configuration:
- Uses the configured main group chat
- Follows any message formatting preferences
- Handles gracefully if Telegram is not available

## Example Usage

After implementing a new feature:
- "Development of the user authentication system is complete. All tests passing. Ready for code review."
- Skill sends formatted Telegram notification
- User gets notification on their phone/device
- Chat shows confirmation that notification was sent

## Error Handling

- If Telegram is not configured: Gracefully skip notification and inform in chat
- If message sending fails: Retry once, then report error
- Always provide fallback confirmation in the current chat interface

## Testing

Test the skill by:
1. Ensuring Telegram is configured (`/add-telegram`)
2. Completing a small development task
3. Running the notification skill
4. Verifying message is received on Telegram
5. Checking message formatting and content

## Security Notes

- Only sends summary information, not sensitive details
- Respects any existing Telegram security configurations
- Does not transmit code content, only high-level descriptions