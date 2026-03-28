#!/usr/bin/env python3
"""Encode composited frames to MP4 and GIF using ffmpeg.

Usage:
    python encode.py --frames /tmp/composited --output /tmp/walkthrough
    python encode.py --frames /tmp/composited --output /tmp/walkthrough --fps 15 --gif-width 1280

Output:
    /tmp/walkthrough.mp4
    /tmp/walkthrough.gif
"""
import argparse
import shutil
import subprocess
import sys
from pathlib import Path


def check_ffmpeg() -> bool:
    """Return True if ffmpeg is available on PATH."""
    return shutil.which("ffmpeg") is not None


def encode_mp4(frames_dir: Path, output_path: Path, fps: int = 15):
    """Encode PNG frame sequence to H.264 MP4."""
    result = subprocess.run(
        [
            "ffmpeg", "-y",
            "-r", str(fps),
            "-i", str(frames_dir / "%05d.png"),
            "-c:v", "libx264",
            "-pix_fmt", "yuv420p",
            "-crf", "18",
            str(output_path),
        ],
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        raise RuntimeError(f"ffmpeg MP4 failed:\n{result.stderr}")
    print(f"MP4 → {output_path}", file=sys.stderr)


def encode_gif(mp4_path: Path, output_path: Path, fps: int = 10, width: int = 1280):
    """Convert MP4 to high-quality GIF using two-pass palette generation."""
    vf = (
        f"fps={fps},scale={width}:-1:flags=lanczos,"
        "split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse"
    )
    result = subprocess.run(
        ["ffmpeg", "-y", "-i", str(mp4_path), "-vf", vf, str(output_path)],
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        raise RuntimeError(f"ffmpeg GIF failed:\n{result.stderr}")
    print(f"GIF → {output_path}", file=sys.stderr)


def main():
    parser = argparse.ArgumentParser(description="Encode frames to MP4 and GIF")
    parser.add_argument("--frames", required=True, help="Composited frames directory")
    parser.add_argument("--output", required=True,
                        help="Output path prefix without extension (e.g. /tmp/walkthrough)")
    parser.add_argument("--fps", type=int, default=15)
    parser.add_argument("--gif-width", type=int, default=1280)
    args = parser.parse_args()

    if not check_ffmpeg():
        print("Error: ffmpeg not found. Install with: apt-get install ffmpeg", file=sys.stderr)
        sys.exit(1)

    frames_dir = Path(args.frames)
    mp4_path = Path(args.output + ".mp4")
    gif_path = Path(args.output + ".gif")

    encode_mp4(frames_dir, mp4_path, args.fps)
    encode_gif(mp4_path, gif_path, fps=10, width=args.gif_width)
    print(f"Done. MP4: {mp4_path}  GIF: {gif_path}", file=sys.stderr)


if __name__ == "__main__":
    main()
