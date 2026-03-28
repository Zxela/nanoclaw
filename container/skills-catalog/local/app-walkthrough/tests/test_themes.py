import pytest
from themes import get_theme, THEMES
from themes.base import ThemeConfig


def test_all_themes_loadable():
    for name in ["saas", "cinematic", "dev"]:
        theme = get_theme(name)
        assert isinstance(theme, ThemeConfig)


def test_get_theme_raises_on_unknown():
    with pytest.raises(ValueError, match="Unknown theme"):
        get_theme("nonexistent")


def test_all_themes_have_required_fields():
    required = [
        "name", "cursor_color", "cursor_radius", "cursor_border_width",
        "cursor_glow", "cursor_glow_color", "cursor_trail_length",
        "cursor_trail_opacity_decay", "badge_font_path", "badge_font_size",
        "badge_bg_color", "badge_text_color", "badge_padding",
        "badge_border_radius", "badge_position", "badge_always_visible",
        "callout_font_path", "callout_font_size", "callout_bg_color",
        "callout_text_color", "callout_border_radius", "callout_prefix",
        "vignette", "vignette_strength", "letterbox",
        "progress_bar", "progress_bar_color",
    ]
    for name, theme in THEMES.items():
        for field in required:
            assert hasattr(theme, field), f"Theme '{name}' missing: {field}"


def test_cursor_colors_are_valid_rgb():
    for name, theme in THEMES.items():
        assert len(theme.cursor_color) == 3
        for v in theme.cursor_color:
            assert 0 <= v <= 255, f"Theme '{name}' cursor_color out of range"


def test_saas_has_progress_bar():
    assert get_theme("saas").progress_bar is True


def test_cinematic_has_vignette_and_letterbox():
    t = get_theme("cinematic")
    assert t.vignette is True
    assert t.vignette_strength > 0
    assert t.letterbox is True


def test_dev_badge_always_visible():
    assert get_theme("dev").badge_always_visible is True


def test_badge_position_valid():
    for name, theme in THEMES.items():
        assert theme.badge_position in ("bottom-left", "bottom-right"), \
            f"Theme '{name}' badge_position invalid"
