#!/usr/bin/env python3
"""Parse a prose markdown walkthrough script into a structured action list.

Usage:
    python parse_script.py --script demo-script.md
    python parse_script.py --inline "1. Go to https://app.com 2. Click Sign In"
    python parse_script.py --script demo-script.md --env LOGIN_EMAIL=user@example.com

Outputs JSON to stdout: {"url": "...", "theme": "saas", "actions": [...]}
"""
import argparse
import json
import os
import re
import sys
from typing import Optional

import yaml
from anthropic import Anthropic

SYSTEM_PROMPT = """You convert prose walkthrough steps into a structured JSON action list.

Return a JSON array where each item has:
- action: "goto" | "click" | "type" | "key" | "wait"
- label: human-readable annotation shown in video overlay (required for all)
- url: full URL (only for goto)
- hint: text/aria hint to find element (for click and type)
- text: text to type (for type)
- keys: array of key names (for key — e.g. ["cmd","k"], ["Enter"])
- delay_ms: optional ms pause after action (omit to use default 500ms)

Modifier key names: "cmd", "ctrl", "shift", "alt"
Special keys: "Enter", "Escape", "Tab", "Backspace", "Space", "ArrowDown", "ArrowUp"

Rules:
- "Go to X" or "Navigate to X" → {action:"goto", url:"X", label:"Navigate to X"}
- "Click X" → {action:"click", hint:"X", label:"Click X"}
- "Type X in Y" → {action:"type", hint:"Y", text:"X", label:"Type X"}
- "Press cmd+k" → {action:"key", keys:["cmd","k"], label:"Press ⌘K"}
- "Navigate to Settings → Billing" → two clicks: Settings then Billing
- "Wait for X" → {action:"wait", delay_ms:1500, label:"Waiting for X"}

Use modifier symbols in labels: ⌘ for cmd, ⌥ for alt, ⇧ for shift, ⌃ for ctrl.

Return ONLY the JSON array. No explanation, no markdown fences."""


def parse_frontmatter(content: str) -> tuple[dict, str]:
    """Extract YAML front matter. Returns (config_dict, prose_body)."""
    if not content.startswith("---"):
        return {}, content
    end = content.find("\n---", 4)
    if end == -1:
        return {}, content
    fm_text = content[4:end]
    config = yaml.safe_load(fm_text) or {}
    prose = content[end + 4:].strip()
    return config, prose


def resolve_credentials(config: dict) -> dict:
    """Replace $ENV_VAR references with actual env var values."""
    creds = config.get("credentials", {})
    resolved = {}
    for key, val in creds.items():
        if isinstance(val, str) and val.startswith("$"):
            env_name = val[1:]
            env_val = os.environ.get(env_name)
            if env_val is None:
                print(f"Warning: env var {env_name} not set", file=sys.stderr)
            resolved[key] = env_val or ""
        else:
            resolved[key] = str(val)
    return resolved


def interpolate_text(text: str, credentials: dict) -> str:
    """Replace {{key}} placeholders with credential values."""
    for key, val in credentials.items():
        text = text.replace(f"{{{{{key}}}}}", val)
    return text


def prose_to_actions(prose: str, client: Anthropic) -> list[dict]:
    """Use Claude to convert prose steps to structured action list."""
    response = client.messages.create(
        model="claude-opus-4-6",
        max_tokens=2048,
        system=SYSTEM_PROMPT,
        messages=[{"role": "user", "content": f"Convert these walkthrough steps:\n\n{prose}"}],
    )
    raw = response.content[0].text.strip()
    # Strip markdown code fences if present
    raw = re.sub(r"^```(?:json)?\n?", "", raw)
    raw = re.sub(r"\n?```$", "", raw)
    return json.loads(raw)


def main():
    parser = argparse.ArgumentParser(description="Parse walkthrough script to action list")
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--script", help="Path to markdown script file")
    group.add_argument("--inline", help="Inline prose steps string")
    parser.add_argument("--env", nargs="*", default=[],
                        help="KEY=VALUE credential overrides (e.g. LOGIN_EMAIL=x)")
    args = parser.parse_args()

    if args.script:
        with open(args.script) as f:
            content = f.read()
    else:
        content = args.inline

    for item in (args.env or []):
        k, _, v = item.partition("=")
        os.environ[k] = v

    config, prose = parse_frontmatter(content)
    credentials = resolve_credentials(config)
    prose = interpolate_text(prose, credentials)

    client = Anthropic()
    actions = prose_to_actions(prose, client)

    if config.get("url") and (not actions or actions[0].get("action") != "goto"):
        actions.insert(0, {
            "action": "goto",
            "url": config["url"],
            "label": f"Navigate to {config['url']}",
        })

    result = {
        "url": config.get("url", ""),
        "theme": config.get("theme", "saas"),
        "actions": actions,
    }
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
