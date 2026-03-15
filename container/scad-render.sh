#!/bin/bash
# Render an OpenSCAD file to PNG.
# Usage: scad-render <input.scad> [output.png] [WIDTHxHEIGHT]
# Extension point: swap this script for an STL→raytracer pipeline later.
set -euo pipefail

INPUT="$1"
OUTPUT="${2:-${INPUT%.scad}.png}"
SIZE="${3:-1024,1024}"

if [ ! -f "$INPUT" ]; then
  echo "Error: $INPUT not found" >&2
  exit 1
fi

# xvfb-run provides a virtual X display for OpenSCAD's renderer
xvfb-run --auto-servernum --server-args="-screen 0 1280x1024x24" \
  openscad -o "$OUTPUT" --imgsize="$SIZE" --render "$INPUT" 2>&1

if [ -f "$OUTPUT" ]; then
  echo "Rendered: $OUTPUT"
else
  echo "Error: rendering failed" >&2
  exit 1
fi
