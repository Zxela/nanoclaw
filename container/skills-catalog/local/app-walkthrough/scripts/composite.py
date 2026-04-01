#!/usr/bin/env python3
"""Composite overlay elements onto walkthrough frames using Pillow.

Usage:
    python composite.py --frames /tmp/frames --output /tmp/composited --theme saas

Input:  /tmp/frames/*.png  +  /tmp/frames/metadata.json
Output: /tmp/composited/*.png  (same filenames, overlays applied)
"""
import argparse
import json
import math
import os
import sys
from pathlib import Path
from typing import Optional

from PIL import Image, ImageDraw, ImageFont

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from themes import get_theme
from themes.base import ThemeConfig

KEY_BADGE_FADE_FRAMES = int(1.5 * 15)  # 1.5 seconds at 15fps = 22 frames

KEY_SYMBOLS = {
    "cmd": "⌘", "ctrl": "⌃", "alt": "⌥", "shift": "⇧", "meta": "⌘",
}


def load_font(path: Optional[str], size: int) -> ImageFont.FreeTypeFont:
    """Load font from path, falling back through system fonts to Pillow default."""
    if path and os.path.exists(path):
        return ImageFont.truetype(path, size)
    for try_path in [
        "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/truetype/freefont/FreeSans.ttf",
        "/usr/share/fonts/truetype/ubuntu/Ubuntu-R.ttf",
    ]:
        if os.path.exists(try_path):
            return ImageFont.truetype(try_path, size)
    return ImageFont.load_default()


def draw_cursor(draw: ImageDraw.ImageDraw, pos: list, theme: ThemeConfig,
                opacity: float = 1.0):
    """Draw cursor ring at pos, with optional glow."""
    x, y = pos
    r = theme.cursor_radius
    bw = theme.cursor_border_width

    if theme.cursor_glow:
        gc = theme.cursor_glow_color
        for glow_r in range(r + 12, r - 1, -2):
            t = (glow_r - r) / 12
            alpha = int(gc[3] * opacity * max(0.0, 1 - t ** 1.5))
            draw.ellipse(
                [x - glow_r, y - glow_r, x + glow_r, y + glow_r],
                outline=(*gc[:3], max(0, alpha)),
                width=1,
            )

    alpha = int(255 * opacity)
    cc = theme.cursor_color
    draw.ellipse(
        [x - r, y - r, x + r, y + r],
        outline=(*cc, alpha),
        width=bw,
    )


def draw_keyboard_badge(draw: ImageDraw.ImageDraw, keys: list, theme: ThemeConfig,
                        img_width: int, img_height: int,
                        font: ImageFont.FreeTypeFont, opacity: float = 1.0):
    """Draw keyboard badge pills. Chords render as separate pills with '+' text between them."""
    if not keys:
        return

    def key_label(k: str) -> str:
        return KEY_SYMBOLS.get(k.lower(), k.upper())

    labels = [key_label(k) for k in keys]
    px, py = theme.badge_padding
    br = theme.badge_border_radius
    margin = 16
    gap = 8  # space around the '+' separator

    # Measure each pill
    pill_sizes = []
    for lbl in labels:
        bbox = font.getbbox(lbl)
        w = (bbox[2] - bbox[0]) + px * 2
        h = (bbox[3] - bbox[1]) + py * 2
        pill_sizes.append((w, h, bbox[1], lbl))

    # Measure '+' separator text
    sep = "+"
    sep_bbox = font.getbbox(sep)
    sep_w = sep_bbox[2] - sep_bbox[0]
    sep_h = sep_bbox[3] - sep_bbox[1]

    n_seps = len(labels) - 1
    total_width = (
        sum(p[0] for p in pill_sizes)
        + (sep_w + gap * 2) * n_seps
    )
    max_height = max(p[1] for p in pill_sizes)

    x = margin if theme.badge_position == "bottom-left" else img_width - total_width - margin
    y = img_height - max_height - margin

    bg = theme.badge_bg_color
    tc = theme.badge_text_color
    bg_alpha = int(255 * opacity)
    tc_alpha = int(255 * opacity)

    for idx, (pw, ph, text_top_offset, lbl) in enumerate(pill_sizes):
        # Draw pill background
        draw.rounded_rectangle(
            [x, y, x + pw, y + ph],
            radius=br,
            fill=(*bg, bg_alpha),
        )
        # Draw pill text
        draw.text(
            (x + px, y + py - text_top_offset),
            lbl,
            font=font,
            fill=(*tc, tc_alpha),
        )
        x += pw

        # Draw '+' separator between pills
        if idx < n_seps:
            sep_x = x + gap
            sep_y = y + (max_height - sep_h) // 2 - sep_bbox[1]
            draw.text(
                (sep_x, sep_y),
                sep,
                font=font,
                fill=(*tc, tc_alpha),
            )
            x += sep_w + gap * 2


def draw_callout(draw: ImageDraw.ImageDraw, label: str, theme: ThemeConfig,
                 img_width: int, img_height: int,
                 font: ImageFont.FreeTypeFont,
                 slide_offset: int = 0,
                 opacity: float = 1.0):
    """Draw step annotation as a fixed subtitle strip at bottom of frame.
    slide_offset: vertical pixel offset (positive = lower/hidden, 0 = fully shown)
    """
    if not label:
        return
    text = theme.callout_prefix + label
    px, py = 16, 10
    br = theme.callout_border_radius

    bbox = font.getbbox(text)
    tw = bbox[2] - bbox[0]
    th = bbox[3] - bbox[1]
    box_w = tw + px * 2
    box_h = th + py * 2

    # Fixed position: horizontally centered, near bottom (above progress bar)
    bar_clearance = 12 if theme.progress_bar else 4
    bx = (img_width - box_w) // 2
    by = img_height - box_h - bar_clearance - 8 + slide_offset  # slide_offset pushes it down off-screen

    bg = theme.callout_bg_color
    tc = theme.callout_text_color
    bg_alpha = int(bg[3] * opacity)
    tc_alpha = int(255 * opacity)

    draw.rounded_rectangle(
        [bx, by, bx + box_w, by + box_h],
        radius=br,
        fill=(*bg[:3], bg_alpha),
    )
    draw.text(
        (bx + px, by + py - bbox[1]),
        text,
        font=font,
        fill=(*tc, tc_alpha),
    )


def draw_click_ripple(draw: ImageDraw.ImageDraw, center: list, progress: float,
                      theme: ThemeConfig):
    """Draw expanding ripple ring at click point."""
    cx, cy = center
    max_r = 55
    r = int(max_r * progress)
    alpha = int(220 * (1 - progress))
    if alpha <= 0 or r <= 0:
        return
    cc = theme.cursor_color
    draw.ellipse(
        [cx - r, cy - r, cx + r, cy + r],
        outline=(*cc, alpha),
        width=max(1, int(3 * (1 - progress))),
    )
    # Second inner ring, slightly behind
    r2 = max(0, int(r * 0.65))
    alpha2 = int(140 * (1 - progress))
    if r2 > 0 and alpha2 > 0:
        draw.ellipse(
            [cx - r2, cy - r2, cx + r2, cy + r2],
            outline=(*cc, alpha2),
            width=1,
        )


def draw_spotlight(img: Image.Image, pos: list, progress: float,
                   theme: ThemeConfig) -> Image.Image:
    """Draw a soft highlight circle at target position (cursor just arrived)."""
    if progress <= 0:
        return img
    cx, cy = pos
    max_r = 38
    r = int(max_r * min(progress * 1.5, 1.0))
    alpha = int(70 * math.sin(progress * math.pi))  # fade in then out
    if r <= 0 or alpha <= 0:
        return img
    spot = Image.new("RGBA", img.size, (0, 0, 0, 0))
    sdraw = ImageDraw.Draw(spot)
    cc = theme.cursor_color
    sdraw.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(*cc, alpha))
    return Image.alpha_composite(img.convert("RGBA"), spot)


def draw_scene_transition(img: Image.Image, label: str, scene_frame: int,
                          scene_total: int, font: ImageFont.FreeTypeFont) -> Image.Image:
    """Render full-frame scene transition card with flying text."""
    w, h = img.size

    # Darken base frame
    dark = Image.new("RGBA", (w, h), (0, 0, 0, 180))
    result = Image.alpha_composite(img.convert("RGBA"), dark)

    # Animation phases: fly-in (20%), hold (60%), fly-out (20%)
    fly_frames = max(1, int(scene_total * 0.25))
    hold_start = fly_frames
    hold_end = scene_total - fly_frames

    if scene_frame < hold_start:
        t = scene_frame / fly_frames
        t_ease = t * t * (3 - 2 * t)
        x_offset = int(w * (1 - t_ease))   # slides in from right
        text_alpha = int(255 * t_ease)
    elif scene_frame >= hold_end:
        t = (scene_frame - hold_end) / fly_frames
        t_ease = t * t * (3 - 2 * t)
        x_offset = int(-w * t_ease)         # slides out to left
        text_alpha = int(255 * (1 - t_ease))
    else:
        x_offset = 0
        text_alpha = 255

    # Draw centered text
    draw = ImageDraw.Draw(result)
    bbox = font.getbbox(label)
    tw = bbox[2] - bbox[0]
    th = bbox[3] - bbox[1]
    tx = (w - tw) // 2 + x_offset
    ty = (h - th) // 2 - bbox[1]

    # Shadow
    draw.text((tx + 3, ty + 3), label, font=font, fill=(0, 0, 0, int(text_alpha * 0.6)))
    # Text
    draw.text((tx, ty), label, font=font, fill=(255, 255, 255, text_alpha))

    # Thin accent line under text
    line_y = ty + th + 12
    line_x1 = (w - min(tw + 80, w - 40)) // 2 + x_offset
    line_x2 = line_x1 + min(tw + 80, w - 40)
    draw.rectangle([line_x1, line_y, line_x2, line_y + 2], fill=(255, 255, 255, int(text_alpha * 0.5)))

    return result


def apply_vignette(img: Image.Image, strength: float) -> Image.Image:
    """Darken edges with a radial vignette."""
    w, h = img.size
    vignette = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    draw = ImageDraw.Draw(vignette)
    cx, cy = w // 2, h // 2
    steps = 24
    for i in range(steps, 0, -1):
        t = i / steps
        rx = int(cx * t)
        ry = int(cy * t)
        alpha = int(255 * strength * (1 - t) ** 1.8)
        draw.ellipse(
            [cx - rx, cy - ry, cx + rx, cy + ry],
            fill=(0, 0, 0, max(0, alpha)),
        )
    return Image.alpha_composite(img.convert("RGBA"), vignette)


def apply_letterbox(img: Image.Image) -> Image.Image:
    """Add black letterbox bars for 2.39:1 cinematic aspect ratio."""
    w, h = img.size
    target_h = int(w / 2.39)
    if target_h >= h:
        return img
    bar_h = (h - target_h) // 2
    result = img.copy().convert("RGB")
    draw = ImageDraw.Draw(result)
    draw.rectangle([0, 0, w, bar_h], fill=(0, 0, 0))
    draw.rectangle([0, h - bar_h, w, h], fill=(0, 0, 0))
    return result


def draw_progress_bar(draw: ImageDraw.ImageDraw, step_index: int, total_steps: int,
                      theme: ThemeConfig, img_width: int, img_height: int):
    bar_h = 4
    y = img_height - bar_h
    filled_w = int(img_width * (step_index + 1) / max(total_steps, 1))
    draw.rectangle([0, y, img_width, img_height], fill=(40, 40, 40, 180))
    if filled_w > 0:
        draw.rectangle([0, y, filled_w, img_height], fill=(*theme.progress_bar_color, 220))


def composite_frames(frames_dir: Path, output_dir: Path, theme_name: str):
    """Apply overlays to all frames in frames_dir, write to output_dir."""
    output_dir.mkdir(parents=True, exist_ok=True)
    theme = get_theme(theme_name)

    with open(frames_dir / "metadata.json") as f:
        metadata = json.load(f)

    total_steps = max((m["step_index"] for m in metadata), default=0) + 1
    badge_font = load_font(theme.badge_font_path, theme.badge_font_size)
    callout_font = load_font(theme.callout_font_path, theme.callout_font_size)
    scene_font = load_font(theme.callout_font_path, 48)

    # Compute per-step frame ranges for callout slide animation
    step_frames: dict[int, list[int]] = {}  # step_index → list of frame indices
    for i, m in enumerate(metadata):
        si = m["step_index"]
        step_frames.setdefault(si, []).append(i)

    SLIDE_IN_FRAMES = 6   # frames to slide in at step start
    SLIDE_OUT_FRAMES = 6  # frames to slide out at step end
    CALLOUT_HEIGHT = 48   # approximate px height to slide by

    trail: list = []
    key_display: list = []
    key_frames_since = KEY_BADGE_FADE_FRAMES  # start faded

    for frame_idx, meta in enumerate(metadata):
        src = frames_dir / meta["frame"]
        img = Image.open(src).convert("RGBA")
        w, h = img.size

        if theme.vignette:
            img = apply_vignette(img, theme.vignette_strength)

        # Spotlight pulse when cursor arrives at target
        if meta.get("step_action") == "spotlight" and meta.get("spotlight_pos"):
            img = draw_spotlight(img, meta["spotlight_pos"], meta.get("spotlight_progress", 0.5), theme)

        # Scene transition: skip normal overlay pipeline
        if meta.get("step_action") == "scene":
            result = draw_scene_transition(
                img, meta["step_label"],
                meta.get("scene_frame", 0), meta.get("scene_total", 30),
                scene_font,
            )
            out_path = output_dir / meta["frame"]
            result.convert("RGB").save(str(out_path), "PNG")
            continue  # skip normal overlay pipeline for scene frames

        overlay = Image.new("RGBA", (w, h), (0, 0, 0, 0))
        draw = ImageDraw.Draw(overlay)

        cursor = meta["cursor"]
        keys = meta["keys"]

        # Update cursor trail
        trail.append(cursor[:])
        if len(trail) > theme.cursor_trail_length:
            trail.pop(0)

        # Update key badge state
        if keys:
            key_display = keys[:]
            key_frames_since = 0
        else:
            key_frames_since += 1

        # Draw trail (older steps = more transparent)
        for ti, tpos in enumerate(trail[:-1]):
            age = len(trail) - 1 - ti
            trail_opacity = (theme.cursor_trail_opacity_decay ** age) * 0.5
            draw_cursor(draw, tpos, theme, opacity=trail_opacity)

        # Draw current cursor
        draw_cursor(draw, cursor, theme, opacity=1.0)

        # Draw click ripple
        if meta.get("step_action") == "ripple" and meta.get("ripple_center"):
            draw_click_ripple(draw, meta["ripple_center"], meta.get("ripple_progress", 0.5), theme)

        # Draw keyboard badge
        if theme.badge_always_visible:
            draw_keyboard_badge(draw, key_display or [], theme, w, h, badge_font, 1.0)
        elif key_frames_since < KEY_BADGE_FADE_FRAMES:
            fade = max(0.0, 1.0 - key_frames_since / KEY_BADGE_FADE_FRAMES)
            draw_keyboard_badge(draw, key_display, theme, w, h, badge_font, fade)

        # Compute callout slide animation
        step_idx_val = meta["step_index"]
        step_frame_list = step_frames.get(step_idx_val, [])
        pos_in_step = step_frame_list.index(frame_idx) if frame_idx in step_frame_list else 0
        total_in_step = len(step_frame_list)

        if pos_in_step < SLIDE_IN_FRAMES:
            t = pos_in_step / SLIDE_IN_FRAMES
            t_ease = t * t * (3 - 2 * t)
            callout_slide = int(CALLOUT_HEIGHT * (1 - t_ease))
        elif pos_in_step >= total_in_step - SLIDE_OUT_FRAMES:
            t = (pos_in_step - (total_in_step - SLIDE_OUT_FRAMES)) / SLIDE_OUT_FRAMES
            t_ease = t * t * (3 - 2 * t)
            callout_slide = int(CALLOUT_HEIGHT * t_ease)
        else:
            callout_slide = 0

        # Draw step callout
        draw_callout(draw, meta["step_label"], theme, w, h, callout_font,
                     slide_offset=callout_slide)

        # Draw progress bar
        if theme.progress_bar:
            draw_progress_bar(draw, meta["step_index"], total_steps, theme, w, h)

        result = Image.alpha_composite(img, overlay)

        if theme.letterbox:
            result = apply_letterbox(result)

        out_path = output_dir / meta["frame"]
        result.convert("RGB").save(str(out_path), "PNG")

    print(f"Composited {len(metadata)} frames -> {output_dir}", file=sys.stderr)


def main():
    parser = argparse.ArgumentParser(description="Composite overlays onto walkthrough frames")
    parser.add_argument("--frames", required=True, help="Input frames directory")
    parser.add_argument("--output", required=True, help="Output composited frames directory")
    parser.add_argument("--theme", default="saas", choices=["saas", "cinematic", "dev"])
    args = parser.parse_args()
    composite_frames(Path(args.frames), Path(args.output), args.theme)


if __name__ == "__main__":
    main()
