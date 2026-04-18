#!/usr/bin/env python3
"""
D&D 5e dice roller for the tabletop-rpg-gm skill.
Usage: dice.py <expression> [modifier]
  expression: d20, 2d6, d4, d8, d10, d12, d100, etc.
  modifier: +4, -1, +0 (optional)

Output: JSON with roll details
"""
import json
import random
import re
import sys


def parse_expression(expr):
    """Parse dice expression like d20, 2d6, d4+3"""
    expr = expr.strip().lower()
    # Handle expressions like "2d6+3" or "d20" or "1d8"
    m = re.match(r'^(\d*)d(\d+)$', expr)
    if not m:
        raise ValueError(f"Invalid dice expression: {expr}")
    count = int(m.group(1)) if m.group(1) else 1
    sides = int(m.group(2))
    return count, sides


def parse_modifier(mod_str):
    """Parse modifier like +4, -1, +0"""
    if not mod_str:
        return 0
    mod_str = mod_str.strip()
    # Already has sign
    if mod_str.startswith('+') or mod_str.startswith('-'):
        return int(mod_str)
    return int(mod_str)


def roll(count, sides):
    return [random.randint(1, sides) for _ in range(count)]


def main():
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Usage: dice.py <expression> [modifier]"}))
        sys.exit(1)

    expr = sys.argv[1]
    modifier = parse_modifier(sys.argv[2]) if len(sys.argv) > 2 else 0

    try:
        count, sides = parse_expression(expr)
    except ValueError as e:
        print(json.dumps({"error": str(e)}))
        sys.exit(1)

    rolls = roll(count, sides)
    raw_total = sum(rolls)
    total = raw_total + modifier

    # D20-specific flags
    is_nat_20 = (count == 1 and sides == 20 and rolls[0] == 20)
    is_nat_1 = (count == 1 and sides == 20 and rolls[0] == 1)

    result = {
        "expression": expr,
        "count": count,
        "sides": sides,
        "rolls": rolls,
        "raw": raw_total,
        "modifier": modifier,
        "total": total,
        "natural": rolls[0] if count == 1 else None,
        "is_nat_20": is_nat_20,
        "is_nat_1": is_nat_1,
    }

    print(json.dumps(result))


if __name__ == "__main__":
    main()
