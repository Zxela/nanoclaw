#!/usr/bin/env python3
"""
portfolio-tracker skill — track paper portfolio P&L, allocation, and drawdown

Usage:
  python3 portfolio_tracker.py snapshot          # take a fresh snapshot (fetches live prices)
  python3 portfolio_tracker.py summary           # print current portfolio summary
  python3 portfolio_tracker.py history           # show snapshot history (daily returns)
  python3 portfolio_tracker.py export            # export positions to CSV
  python3 portfolio_tracker.py chart-data        # return chart-ready JSON (for graphing tools)
  python3 portfolio_tracker.py reset             # wipe history (keep structure)
"""

import os
import sys
import json
import csv
import argparse
import subprocess
import urllib.request
from datetime import datetime, timezone, timedelta
from pathlib import Path


PORTFOLIO_DIR = Path(os.environ.get("PORTFOLIO_DIR", "/workspace/group/portfolio"))
SNAPSHOTS_FILE = PORTFOLIO_DIR / "snapshots.json"
MARKET_DATA_SCRIPT = Path(__file__).parent.parent / "market-data" / "market_data.py"


# ─── Persistence ────────────────────────────────────────────────────────────

def load_snapshots() -> list[dict]:
    PORTFOLIO_DIR.mkdir(parents=True, exist_ok=True)
    if not SNAPSHOTS_FILE.exists():
        return []
    try:
        return json.loads(SNAPSHOTS_FILE.read_text())
    except Exception:
        return []


def save_snapshots(snapshots: list[dict]) -> None:
    PORTFOLIO_DIR.mkdir(parents=True, exist_ok=True)
    SNAPSHOTS_FILE.write_text(json.dumps(snapshots, indent=2))


# ─── Alpaca helpers ──────────────────────────────────────────────────────────

def alpaca_get(path: str) -> dict | list:
    api_key = os.environ.get("ALPACA_API_KEY", "")
    secret = os.environ.get("ALPACA_SECRET_KEY", "")
    if not api_key or not secret:
        return {"error": "ALPACA_API_KEY and ALPACA_SECRET_KEY must be set"}
    headers = {
        "APCA-API-KEY-ID": api_key,
        "APCA-API-SECRET-KEY": secret,
    }
    url = f"https://paper-api.alpaca.markets/v2{path}"
    req = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        try:
            err = json.loads(e.read())
        except Exception:
            err = {"message": str(e)}
        return {"error": err.get("message", str(e)), "status": e.code}
    except Exception as e:
        return {"error": str(e)}


def get_account() -> dict:
    data = alpaca_get("/account")
    if "error" in data:
        return data
    return {
        "equity": float(data.get("equity", 0)),
        "cash": float(data.get("cash", 0)),
        "portfolio_value": float(data.get("portfolio_value", 0)),
        "buying_power": float(data.get("buying_power", 0)),
    }


def get_positions() -> list[dict]:
    data = alpaca_get("/positions")
    if isinstance(data, dict) and "error" in data:
        return []
    positions = []
    for p in data:
        positions.append({
            "ticker": p["symbol"],
            "qty": float(p["qty"]),
            "entry_price": float(p["avg_entry_price"]),
            "current_price": float(p["current_price"]),
            "market_value": float(p["market_value"]),
            "unrealized_pnl": float(p["unrealized_pl"]),
            "unrealized_pnl_pct": float(p["unrealized_plpc"]) * 100,
            "cost_basis": float(p["cost_basis"]),
        })
    return positions


def get_closed_pnl_today() -> float:
    """Sum realized P&L from closed orders today."""
    data = alpaca_get("/account/activities/FILL")
    if isinstance(data, dict) and "error" in data:
        return 0.0
    today = datetime.now(timezone.utc).date().isoformat()
    total = 0.0
    for act in data:
        if act.get("transaction_time", "").startswith(today):
            # Each fill: realized_pl may not be directly available from activity
            # Approximate via price - cost tracking not straightforward without order history
            pass
    return total  # Alpaca activities don't include realized P&L directly; rely on account equity delta


# ─── Market data enrichment ──────────────────────────────────────────────────

def enrich_with_sector(positions: list[dict]) -> list[dict]:
    """Add sector info using yfinance (best-effort, no API key needed)."""
    try:
        import yfinance as yf
        for pos in positions:
            try:
                info = yf.Ticker(pos["ticker"]).info
                pos["sector"] = info.get("sector", "Unknown")
                pos["industry"] = info.get("industry", "Unknown")
            except Exception:
                pos["sector"] = "Unknown"
                pos["industry"] = "Unknown"
    except ImportError:
        for pos in positions:
            pos["sector"] = "Unknown"
            pos["industry"] = "Unknown"
    return positions


# ─── Metrics ────────────────────────────────────────────────────────────────

def calc_max_drawdown(snapshots: list[dict]) -> float:
    """Max peak-to-trough drawdown from equity history."""
    if len(snapshots) < 2:
        return 0.0
    equities = [s["account"]["equity"] for s in snapshots if "account" in s]
    if not equities:
        return 0.0
    peak = equities[0]
    max_dd = 0.0
    for eq in equities:
        if eq > peak:
            peak = eq
        dd = (peak - eq) / peak * 100
        if dd > max_dd:
            max_dd = dd
    return round(max_dd, 2)


def calc_return(snapshots: list[dict], days: int) -> float | None:
    """Return over last N days as a percentage."""
    if len(snapshots) < 2:
        return None
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    # Find earliest snapshot within the window
    reference = None
    for s in snapshots:
        ts = datetime.fromisoformat(s["timestamp"])
        if ts >= cutoff:
            reference = s
            break
    if reference is None:
        reference = snapshots[0]
    current_equity = snapshots[-1]["account"]["equity"]
    ref_equity = reference["account"]["equity"]
    if ref_equity == 0:
        return None
    return round((current_equity - ref_equity) / ref_equity * 100, 2)


def calc_allocation(positions: list[dict], total_value: float) -> list[dict]:
    allocs = []
    for pos in positions:
        allocs.append({
            "ticker": pos["ticker"],
            "sector": pos.get("sector", "Unknown"),
            "market_value": pos["market_value"],
            "weight_pct": round(pos["market_value"] / total_value * 100, 2) if total_value > 0 else 0,
        })
    return sorted(allocs, key=lambda x: x["weight_pct"], reverse=True)


# ─── Commands ───────────────────────────────────────────────────────────────

def cmd_snapshot() -> dict:
    account = get_account()
    if "error" in account:
        return account

    positions = get_positions()
    positions = enrich_with_sector(positions)

    snapshots = load_snapshots()
    snap = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "account": account,
        "positions": positions,
    }
    snapshots.append(snap)
    save_snapshots(snapshots)

    return {
        "snapshot_taken": True,
        "timestamp": snap["timestamp"],
        "equity": account["equity"],
        "positions_count": len(positions),
        "total_unrealized_pnl": round(sum(p["unrealized_pnl"] for p in positions), 2),
    }


def cmd_summary() -> dict:
    snapshots = load_snapshots()
    if not snapshots:
        return {"error": "No snapshots found — run 'snapshot' first"}

    latest = snapshots[-1]
    account = latest["account"]
    positions = latest["positions"]
    ts = latest["timestamp"]

    total_market_value = sum(p["market_value"] for p in positions)
    total_unrealized_pnl = sum(p["unrealized_pnl"] for p in positions)
    total_cost = sum(p["cost_basis"] for p in positions)

    allocation = calc_allocation(positions, account["portfolio_value"])
    max_dd = calc_max_drawdown(snapshots)
    daily_return = calc_return(snapshots, days=1)
    weekly_return = calc_return(snapshots, days=7)

    # Sector breakdown
    sector_map: dict[str, float] = {}
    for pos in positions:
        sector = pos.get("sector", "Unknown")
        sector_map[sector] = sector_map.get(sector, 0) + pos["market_value"]
    sector_alloc = [
        {"sector": k, "value": round(v, 2), "weight_pct": round(v / account["portfolio_value"] * 100, 2)}
        for k, v in sorted(sector_map.items(), key=lambda x: x[1], reverse=True)
    ]

    return {
        "as_of": ts,
        "account": account,
        "positions": [
            {
                "ticker": p["ticker"],
                "qty": p["qty"],
                "entry_price": p["entry_price"],
                "current_price": p["current_price"],
                "market_value": round(p["market_value"], 2),
                "unrealized_pnl": round(p["unrealized_pnl"], 2),
                "unrealized_pnl_pct": round(p["unrealized_pnl_pct"], 2),
                "sector": p.get("sector", "Unknown"),
            }
            for p in sorted(positions, key=lambda x: x["market_value"], reverse=True)
        ],
        "totals": {
            "positions": len(positions),
            "invested": round(total_cost, 2),
            "market_value": round(total_market_value, 2),
            "unrealized_pnl": round(total_unrealized_pnl, 2),
            "unrealized_pnl_pct": round(total_unrealized_pnl / total_cost * 100, 2) if total_cost > 0 else 0,
        },
        "performance": {
            "daily_return_pct": daily_return,
            "weekly_return_pct": weekly_return,
            "max_drawdown_pct": max_dd,
        },
        "sector_allocation": sector_alloc,
        "allocation": allocation,
    }


def cmd_history() -> dict:
    snapshots = load_snapshots()
    if not snapshots:
        return {"error": "No snapshots found — run 'snapshot' first"}

    records = []
    for i, s in enumerate(snapshots):
        equity = s["account"]["equity"]
        prev_equity = snapshots[i - 1]["account"]["equity"] if i > 0 else equity
        day_return = round((equity - prev_equity) / prev_equity * 100, 4) if prev_equity > 0 else 0.0
        records.append({
            "timestamp": s["timestamp"],
            "equity": equity,
            "cash": s["account"]["cash"],
            "positions": len(s.get("positions", [])),
            "day_return_pct": day_return,
        })

    return {
        "snapshots": len(records),
        "first": records[0]["timestamp"] if records else None,
        "latest": records[-1]["timestamp"] if records else None,
        "history": records,
    }


def cmd_export() -> dict:
    snapshots = load_snapshots()
    if not snapshots:
        return {"error": "No snapshots found — run 'snapshot' first"}

    latest = snapshots[-1]
    positions = latest["positions"]
    ts = latest["timestamp"].replace(":", "-").split(".")[0]
    csv_path = PORTFOLIO_DIR / f"positions_{ts}.csv"

    PORTFOLIO_DIR.mkdir(parents=True, exist_ok=True)
    with open(csv_path, "w", newline="") as f:
        if not positions:
            f.write("No positions\n")
        else:
            writer = csv.DictWriter(f, fieldnames=[
                "ticker", "qty", "entry_price", "current_price",
                "market_value", "cost_basis", "unrealized_pnl", "unrealized_pnl_pct", "sector"
            ])
            writer.writeheader()
            for p in positions:
                writer.writerow({
                    "ticker": p["ticker"],
                    "qty": p["qty"],
                    "entry_price": p["entry_price"],
                    "current_price": p["current_price"],
                    "market_value": round(p["market_value"], 2),
                    "cost_basis": round(p["cost_basis"], 2),
                    "unrealized_pnl": round(p["unrealized_pnl"], 2),
                    "unrealized_pnl_pct": round(p["unrealized_pnl_pct"], 2),
                    "sector": p.get("sector", "Unknown"),
                })

    return {"exported": str(csv_path), "positions": len(positions)}


def cmd_chart_data() -> dict:
    """Return chart-ready data for equity curve and allocation pie."""
    snapshots = load_snapshots()
    if not snapshots:
        return {"error": "No snapshots found — run 'snapshot' first"}

    equity_curve = [
        {"timestamp": s["timestamp"], "equity": s["account"]["equity"]}
        for s in snapshots
    ]

    latest = snapshots[-1]
    positions = latest["positions"]
    total_pv = latest["account"]["portfolio_value"]

    allocation_pie = [
        {
            "ticker": p["ticker"],
            "sector": p.get("sector", "Unknown"),
            "value": round(p["market_value"], 2),
            "weight_pct": round(p["market_value"] / total_pv * 100, 2) if total_pv > 0 else 0,
        }
        for p in sorted(positions, key=lambda x: x["market_value"], reverse=True)
    ]
    # Add cash slice
    cash = latest["account"]["cash"]
    if cash > 0 and total_pv > 0:
        allocation_pie.append({
            "ticker": "CASH",
            "sector": "Cash",
            "value": round(cash, 2),
            "weight_pct": round(cash / total_pv * 100, 2),
        })

    pnl_bar = [
        {
            "ticker": p["ticker"],
            "unrealized_pnl": round(p["unrealized_pnl"], 2),
            "unrealized_pnl_pct": round(p["unrealized_pnl_pct"], 2),
        }
        for p in sorted(positions, key=lambda x: x["unrealized_pnl"])
    ]

    return {
        "equity_curve": equity_curve,
        "allocation_pie": allocation_pie,
        "pnl_bar": pnl_bar,
    }


def cmd_reset() -> dict:
    snapshots = load_snapshots()
    count = len(snapshots)
    save_snapshots([])
    return {"reset": True, "cleared_snapshots": count}


# ─── CLI ────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Portfolio tracker skill")
    sub = parser.add_subparsers(dest="cmd")

    sub.add_parser("snapshot", help="Take fresh snapshot from Alpaca + enrich with market data")
    sub.add_parser("summary", help="Current portfolio summary with P&L and allocation")
    sub.add_parser("history", help="Equity curve and daily return history")
    sub.add_parser("export", help="Export positions to CSV")
    sub.add_parser("chart-data", help="Chart-ready JSON for equity curve + allocation pie")
    sub.add_parser("reset", help="Wipe snapshot history")

    args = parser.parse_args()

    dispatch = {
        "snapshot": cmd_snapshot,
        "summary": cmd_summary,
        "history": cmd_history,
        "export": cmd_export,
        "chart-data": cmd_chart_data,
        "reset": cmd_reset,
    }

    fn = dispatch.get(args.cmd)
    if fn is None:
        parser.print_help()
        sys.exit(1)

    result = fn()
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
