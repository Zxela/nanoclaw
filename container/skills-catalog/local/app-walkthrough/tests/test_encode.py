import pytest
import subprocess
from pathlib import Path
from unittest.mock import patch, MagicMock, call
from PIL import Image

from encode import encode_mp4, encode_gif, check_ffmpeg


def make_frames(tmp_path: Path, count: int = 12) -> Path:
    frames_dir = tmp_path / "frames"
    frames_dir.mkdir()
    for i in range(1, count + 1):
        img = Image.new("RGB", (1280, 800), color=(i * 15 % 255, 80, 180))
        img.save(str(frames_dir / f"{i:05d}.png"))
    return frames_dir


def test_check_ffmpeg_returns_bool():
    result = check_ffmpeg()
    assert isinstance(result, bool)


def test_encode_mp4_calls_ffmpeg_with_correct_args(tmp_path):
    frames_dir = tmp_path / "frames"
    frames_dir.mkdir()
    mp4_path = tmp_path / "out.mp4"

    mock_result = MagicMock()
    mock_result.returncode = 0
    mock_result.stderr = ""

    with patch("subprocess.run", return_value=mock_result) as mock_run:
        encode_mp4(frames_dir, mp4_path, fps=15)

    args = mock_run.call_args[0][0]
    assert "ffmpeg" in args
    assert str(frames_dir / "%05d.png") in args
    assert str(mp4_path) in args
    assert "15" in args


def test_encode_gif_calls_ffmpeg_with_palette(tmp_path):
    mp4_path = tmp_path / "in.mp4"
    mp4_path.touch()
    gif_path = tmp_path / "out.gif"

    mock_result = MagicMock()
    mock_result.returncode = 0
    mock_result.stderr = ""

    with patch("subprocess.run", return_value=mock_result) as mock_run:
        encode_gif(mp4_path, gif_path, fps=10, width=1280)

    args = mock_run.call_args[0][0]
    assert "ffmpeg" in args
    assert "palettegen" in " ".join(args)
    assert "paletteuse" in " ".join(args)
    assert str(gif_path) in args


def test_encode_mp4_raises_on_ffmpeg_failure(tmp_path):
    frames_dir = tmp_path / "frames"
    frames_dir.mkdir()
    mp4_path = tmp_path / "out.mp4"

    mock_result = MagicMock()
    mock_result.returncode = 1
    mock_result.stderr = "No such file or directory"

    with patch("subprocess.run", return_value=mock_result):
        with pytest.raises(RuntimeError, match="ffmpeg MP4 failed"):
            encode_mp4(frames_dir, mp4_path, fps=15)


def test_encode_gif_raises_on_ffmpeg_failure(tmp_path):
    mp4_path = tmp_path / "in.mp4"
    mp4_path.touch()
    gif_path = tmp_path / "out.gif"

    mock_result = MagicMock()
    mock_result.returncode = 1
    mock_result.stderr = "Invalid data"

    with patch("subprocess.run", return_value=mock_result):
        with pytest.raises(RuntimeError, match="ffmpeg GIF failed"):
            encode_gif(mp4_path, gif_path, fps=10, width=1280)
