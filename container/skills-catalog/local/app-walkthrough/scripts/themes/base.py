from dataclasses import dataclass
from typing import Optional, Tuple


@dataclass
class ThemeConfig:
    name: str
    # Cursor
    cursor_color: Tuple[int, int, int]
    cursor_radius: int
    cursor_border_width: int
    cursor_glow: bool
    cursor_glow_color: Tuple[int, int, int, int]  # RGBA
    cursor_trail_length: int
    cursor_trail_opacity_decay: float  # opacity multiplier per older trail step
    # Keyboard badge
    badge_font_path: Optional[str]  # None = Pillow default
    badge_font_size: int
    badge_bg_color: Tuple[int, int, int]
    badge_text_color: Tuple[int, int, int]
    badge_padding: Tuple[int, int]  # (horizontal, vertical)
    badge_border_radius: int
    badge_position: str  # "bottom-left" | "bottom-right"
    badge_always_visible: bool
    # Step callout
    callout_font_path: Optional[str]
    callout_font_size: int
    callout_bg_color: Tuple[int, int, int, int]  # RGBA
    callout_text_color: Tuple[int, int, int]
    callout_border_radius: int
    callout_prefix: str  # "" for saas/cinematic, "// " for dev
    # Frame extras
    vignette: bool
    vignette_strength: float  # 0.0–1.0
    letterbox: bool
    progress_bar: bool
    progress_bar_color: Tuple[int, int, int]
