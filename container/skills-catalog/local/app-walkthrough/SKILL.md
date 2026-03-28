---
name: app-walkthrough
description: >
  Record professional app demo videos with virtual cursor, keyboard visualization,
  and animated text overlays. Produces MP4 + GIF. Two modes: (1) manual — user provides
  a URL and prose steps; (2) auto-discovery — crawl the app, generate a script, confirm
  with user, then record. Triggers on: "make a walkthrough", "record a demo", "create a
  product demo", "auto-walkthrough".
---

# App Walkthrough

Generate polished app demo videos from a prose description or by auto-discovering the app.

## Prerequisites

These must be installed before the skill can run:

```bash
pip install playwright anthropic pyyaml pillow
playwright install chromium
# Linux:
apt-get install -y ffmpeg
# macOS:
brew install ffmpeg
```

## Manual Mode

User provides a URL + prose steps (inline or as a markdown file with YAML front matter).

**Run the pipeline:**

```bash
BASE=/skills-catalog/local/app-walkthrough/scripts
WORK=/tmp/walkthrough-$$
mkdir -p $WORK/frames $WORK/composited

# 1. Parse prose steps → action list
python $BASE/parse_script.py \
  --inline "1. Go to https://app.com 2. Click Sign In 3. Navigate to Dashboard" \
  > $WORK/actions.json

# (or from a script file)
# python $BASE/parse_script.py --script /path/to/script.md > $WORK/actions.json

# 2. Execute with Playwright → capture frames
python $BASE/execute.py \
  --actions $WORK/actions.json \
  --output $WORK/frames

# 3. Composite overlays
THEME=$(python -c "import json; d=json.load(open('$WORK/actions.json')); print(d.get('theme','saas'))")
python $BASE/composite.py \
  --frames $WORK/frames \
  --output $WORK/composited \
  --theme $THEME

# 4. Encode MP4 + GIF
python $BASE/encode.py \
  --frames $WORK/composited \
  --output $WORK/walkthrough

echo "Output: $WORK/walkthrough.mp4  $WORK/walkthrough.gif"
```

Then send both files to Discord:
```python
mcp__nanoclaw__send_files(
    files=[
        {"path": f"{WORK}/walkthrough.mp4", "name": "walkthrough.mp4"},
        {"path": f"{WORK}/walkthrough.gif", "name": "walkthrough.gif"},
    ],
    caption="Here's your app walkthrough"
)
```

## Auto-Discovery Mode

User says "auto-walkthrough https://app.com" or "discover and record https://app.com".

**Optional credentials** — tell the user to set these env vars before proceeding:
`LOGIN_EMAIL`, `LOGIN_PASSWORD`

**Run the pipeline:**

```bash
BASE=/skills-catalog/local/app-walkthrough/scripts
WORK=/tmp/walkthrough-$$
mkdir -p $WORK

# 1. Crawl app + generate draft script (stdout)
python $BASE/crawl.py --url https://app.com > $WORK/draft-script.md

# 2. Show draft script to user and ask for approval / edits
cat $WORK/draft-script.md
```

After user approves (or edits), continue with the manual mode pipeline using `$WORK/draft-script.md`.

## Script Format Reference

```markdown
---
url: https://app.com
theme: saas          # saas | cinematic | dev
credentials:
  email: $LOGIN_EMAIL
  password: $LOGIN_PASSWORD
---

1. Go to the login page
2. Type {{email}} in the email field
3. Click "Sign In"
4. Navigate to Settings → Billing
5. Press cmd+k to open the command palette
6. Type "new project"
```

## Theme Reference

- **saas** — Clean minimal. White cursor ring. Progress bar. White callouts.
- **cinematic** — Dark vignette + amber glow. Letterbox bars. Bold callouts.
- **dev** — Terminal green cursor. Badge always visible. `// ` callout prefix.

## Interpreting User Requests

- "walkthrough of https://x.com — click A, B" → Manual mode, saas theme
- "auto-walkthrough https://x.com" → Auto-discovery mode, saas theme
- "cinematic demo of https://x.com" → Manual mode, cinematic theme
- "dev-style recording of https://x.com" → Manual mode, dev theme
- "record a demo, here's the script: [paste]" → Manual mode, saas theme
