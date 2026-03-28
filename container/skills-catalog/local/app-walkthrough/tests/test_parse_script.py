import json
import os
import pytest
from unittest.mock import MagicMock

from parse_script import (
    parse_frontmatter,
    resolve_credentials,
    interpolate_text,
    prose_to_actions,
)


def test_parse_frontmatter_with_yaml():
    content = "---\nurl: https://app.com\ntheme: cinematic\n---\n\n1. Go to login"
    config, prose = parse_frontmatter(content)
    assert config["url"] == "https://app.com"
    assert config["theme"] == "cinematic"
    assert prose == "1. Go to login"


def test_parse_frontmatter_no_yaml():
    content = "1. Go to https://app.com"
    config, prose = parse_frontmatter(content)
    assert config == {}
    assert prose == content


def test_parse_frontmatter_empty_yaml():
    content = "---\n---\n\n1. Click Sign In"
    config, prose = parse_frontmatter(content)
    assert config == {}
    assert "Click Sign In" in prose


def test_resolve_credentials_from_env(monkeypatch):
    monkeypatch.setenv("TEST_WALKTHROUGH_EMAIL", "user@example.com")
    config = {"credentials": {"email": "$TEST_WALKTHROUGH_EMAIL"}}
    creds = resolve_credentials(config)
    assert creds["email"] == "user@example.com"


def test_resolve_credentials_missing_env_returns_empty(monkeypatch):
    monkeypatch.delenv("ABSENT_VAR_XYZ", raising=False)
    config = {"credentials": {"email": "$ABSENT_VAR_XYZ"}}
    creds = resolve_credentials(config)
    assert creds["email"] == ""


def test_resolve_credentials_literal_value():
    config = {"credentials": {"token": "hardcoded-token"}}
    creds = resolve_credentials(config)
    assert creds["token"] == "hardcoded-token"


def test_resolve_credentials_empty_config():
    assert resolve_credentials({}) == {}


def test_interpolate_text_single():
    result = interpolate_text("Type {{email}} in field", {"email": "a@b.com"})
    assert result == "Type a@b.com in field"


def test_interpolate_text_multiple():
    result = interpolate_text("{{user}} and {{pass}}", {"user": "alice", "pass": "secret"})
    assert result == "alice and secret"


def test_interpolate_text_no_placeholders():
    assert interpolate_text("Click Sign In", {}) == "Click Sign In"


def test_prose_to_actions_returns_list():
    mock_client = MagicMock()
    mock_client.messages.create.return_value.content = [
        MagicMock(text='[{"action":"goto","url":"https://app.com","label":"Navigate to app"}]')
    ]
    actions = prose_to_actions("1. Go to https://app.com", mock_client)
    assert isinstance(actions, list)
    assert actions[0]["action"] == "goto"


def test_prose_to_actions_strips_code_fences():
    mock_client = MagicMock()
    mock_client.messages.create.return_value.content = [
        MagicMock(text='```json\n[{"action":"click","hint":"Sign In","label":"Click Sign In"}]\n```')
    ]
    actions = prose_to_actions("Click Sign In", mock_client)
    assert actions[0]["action"] == "click"
    assert actions[0]["hint"] == "Sign In"


def test_prose_to_actions_strips_plain_code_fences():
    mock_client = MagicMock()
    mock_client.messages.create.return_value.content = [
        MagicMock(text='```\n[{"action":"key","keys":["cmd","k"],"label":"Open palette"}]\n```')
    ]
    actions = prose_to_actions("Press cmd+k", mock_client)
    assert actions[0]["keys"] == ["cmd", "k"]
