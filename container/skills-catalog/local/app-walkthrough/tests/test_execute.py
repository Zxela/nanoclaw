import json
import pytest
from pathlib import Path
from unittest.mock import MagicMock, patch, call

from execute import (
    take_screenshot,
    get_element_center,
    KEY_MAP,
)


def make_page_mock(screenshot_bytes=None):
    page = MagicMock()
    page.screenshot.return_value = screenshot_bytes or b"\x89PNG\r\n"
    page.title.return_value = "Test Page"
    return page


def test_take_screenshot_saves_file_and_appends_metadata(tmp_path):
    page = make_page_mock()
    frames_dir = tmp_path / "frames"
    frames_dir.mkdir()
    metadata = []

    next_frame = take_screenshot(
        page, frames_dir, 1,
        cursor=[640, 400], keys=["cmd", "k"],
        step_index=2, step_label="Open palette", step_action="key",
        metadata=metadata,
    )

    assert next_frame == 2
    assert len(metadata) == 1
    assert metadata[0]["frame"] == "00001.png"
    assert metadata[0]["cursor"] == [640, 400]
    assert metadata[0]["keys"] == ["cmd", "k"]
    assert metadata[0]["step_index"] == 2
    assert metadata[0]["step_label"] == "Open palette"
    assert metadata[0]["step_action"] == "key"
    page.screenshot.assert_called_once_with(path=str(frames_dir / "00001.png"))


def test_take_screenshot_increments_frame_num(tmp_path):
    page = make_page_mock()
    frames_dir = tmp_path / "frames"
    frames_dir.mkdir()
    metadata = []
    result = take_screenshot(page, frames_dir, 42, [0, 0], [], 0, "test", "goto", metadata)
    assert result == 43
    assert metadata[0]["frame"] == "00042.png"


def test_take_screenshot_cursor_is_copied(tmp_path):
    """Metadata cursor should be a copy, not a reference to the live cursor list."""
    page = make_page_mock()
    frames_dir = tmp_path / "frames"
    frames_dir.mkdir()
    metadata = []
    cursor = [100, 200]
    take_screenshot(page, frames_dir, 1, cursor, [], 0, "test", "click", metadata)
    cursor[0] = 999  # mutate after capture
    assert metadata[0]["cursor"] == [100, 200]  # should not change


def test_key_map_has_modifiers():
    assert KEY_MAP["cmd"] == "Meta"
    assert KEY_MAP["ctrl"] == "Control"
    assert KEY_MAP["alt"] == "Alt"
    assert KEY_MAP["shift"] == "Shift"


def test_get_element_center_uses_bounding_box():
    element = MagicMock()
    element.bounding_box.return_value = {"x": 100.0, "y": 200.0, "width": 80.0, "height": 40.0}
    center = get_element_center(element)
    assert center == [140, 220]


def test_get_element_center_fallback_on_no_bbox():
    element = MagicMock()
    element.bounding_box.return_value = None
    center = get_element_center(element)
    assert isinstance(center, list)
    assert len(center) == 2
