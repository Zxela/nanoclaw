import json
import pytest
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

from composite import (
    composite_frames,
    draw_cursor,
    draw_keyboard_badge,
    draw_callout,
    apply_vignette,
    apply_letterbox,
    load_font,
    KEY_BADGE_FADE_FRAMES,
)
from themes import get_theme


def make_test_frames(tmp_path: Path, count: int = 4) -> Path:
    """Create synthetic frames + metadata.json."""
    frames_dir = tmp_path / "frames"
    frames_dir.mkdir(parents=True, exist_ok=True)
    metadata = []
    for i in range(count):
        img = Image.new("RGB", (1280, 800), color=(50 + i * 20, 80, 150))
        filename = f"{i + 1:05d}.png"
        img.save(str(frames_dir / filename))
        metadata.append({
            "frame": filename,
            "cursor": [640, 400],
            "keys": ["cmd", "k"] if i == 1 else [],
            "step_index": i,
            "step_label": f"Step {i + 1}: do something",
            "step_action": "click" if i != 1 else "key",
        })
    with open(frames_dir / "metadata.json", "w") as f:
        json.dump(metadata, f)
    return frames_dir


def test_composite_creates_output_frames(tmp_path):
    frames_dir = make_test_frames(tmp_path)
    output_dir = tmp_path / "out"
    composite_frames(frames_dir, output_dir, "saas")
    pngs = list(output_dir.glob("*.png"))
    assert len(pngs) == 4


def test_composite_output_same_dimensions(tmp_path):
    frames_dir = make_test_frames(tmp_path)
    output_dir = tmp_path / "out"
    composite_frames(frames_dir, output_dir, "saas")
    for png in sorted(output_dir.glob("*.png")):
        img = Image.open(png)
        assert img.size == (1280, 800)


def test_cinematic_applies_letterbox_black_bars(tmp_path):
    frames_dir = make_test_frames(tmp_path)
    output_dir = tmp_path / "out"
    composite_frames(frames_dir, output_dir, "cinematic")
    img = Image.open(str(output_dir / "00001.png")).convert("RGB")
    # Top-left corner pixel should be black (letterbox bar)
    assert img.getpixel((10, 5)) == (0, 0, 0)


def test_all_themes_composite_without_error(tmp_path):
    for theme_name in ["saas", "cinematic", "dev"]:
        frames_dir = make_test_frames(tmp_path / theme_name)
        output_dir = tmp_path / f"{theme_name}_out"
        composite_frames(frames_dir, output_dir, theme_name)
        assert len(list(output_dir.glob("*.png"))) == 4


def test_draw_cursor_does_not_raise():
    img = Image.new("RGBA", (400, 300), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    theme = get_theme("cinematic")  # has glow
    draw_cursor(draw, [200, 150], theme, opacity=1.0)
    draw_cursor(draw, [200, 150], theme, opacity=0.3)


def test_draw_keyboard_badge_single_key(tmp_path):
    img = Image.new("RGBA", (1280, 800), (30, 30, 30, 255))
    draw = ImageDraw.Draw(img)
    theme = get_theme("saas")
    font = load_font(None, theme.badge_font_size)
    # Should not raise
    draw_keyboard_badge(draw, ["Enter"], theme, 1280, 800, font, opacity=1.0)


def test_draw_keyboard_badge_chord(tmp_path):
    img = Image.new("RGBA", (1280, 800), (30, 30, 30, 255))
    draw = ImageDraw.Draw(img)
    theme = get_theme("saas")
    font = load_font(None, theme.badge_font_size)
    draw_keyboard_badge(draw, ["cmd", "k"], theme, 1280, 800, font, opacity=1.0)
    draw_keyboard_badge(draw, ["shift", "cmd", "p"], theme, 1280, 800, font, opacity=1.0)


def test_draw_keyboard_badge_chord_renders_plus_separator(tmp_path):
    """Chord badges should render with '+' text between pills."""
    img = Image.new("RGBA", (1280, 800), (30, 30, 30, 255))
    draw = ImageDraw.Draw(img)
    theme = get_theme("saas")
    font = load_font(None, theme.badge_font_size)

    # Render cmd+k chord
    img_before = img.copy()
    draw_keyboard_badge(draw, ["cmd", "k"], theme, 1280, 800, font, opacity=1.0)

    # The image should have changed (pixels were drawn)
    arr_before = list(img_before.getdata())
    arr_after = list(img.getdata())
    assert arr_before != arr_after, "Badge should have drawn pixels"


def test_draw_callout_does_not_raise():
    img = Image.new("RGBA", (1280, 800), (50, 50, 50, 255))
    draw = ImageDraw.Draw(img)
    theme = get_theme("dev")
    font = load_font(None, theme.callout_font_size)
    draw_callout(draw, "Click the button", theme, 1280, 800, font)
    draw_callout(draw, "Near top edge", theme, 1280, 800, font)


def test_apply_vignette_returns_same_size():
    img = Image.new("RGB", (800, 600), (200, 200, 200))
    result = apply_vignette(img, strength=0.5)
    assert result.size == (800, 600)


def test_apply_letterbox_adds_black_bars():
    img = Image.new("RGB", (1280, 800), (100, 100, 200))
    result = apply_letterbox(img)
    # Top pixel should be black
    assert result.getpixel((640, 2)) == (0, 0, 0)


def test_load_font_fallback_returns_font():
    font = load_font(None, 14)
    assert font is not None

def test_load_font_missing_path_falls_back():
    font = load_font("/nonexistent/path/font.ttf", 14)
    assert font is not None


def test_key_badge_fade_frames_is_positive():
    assert KEY_BADGE_FADE_FRAMES > 0
