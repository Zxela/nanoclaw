"""Tests for portfolio_tracker.py — unit tests with mocked Alpaca + yfinance."""

import json
import pytest
import sys
from pathlib import Path
from unittest.mock import patch, MagicMock

# Add parent dir to path so we can import portfolio_tracker
sys.path.insert(0, str(Path(__file__).parent.parent))

import portfolio_tracker as pt


# ─── Fixtures ───────────────────────────────────────────────────────────────

FAKE_ACCOUNT = {
    "equity": 105000.0,
    "cash": 42000.0,
    "portfolio_value": 105000.0,
    "buying_power": 84000.0,
}

FAKE_POSITIONS = [
    {
        "ticker": "AAPL",
        "qty": 10.0,
        "entry_price": 180.0,
        "current_price": 200.0,
        "market_value": 2000.0,
        "unrealized_pnl": 200.0,
        "unrealized_pnl_pct": 11.11,
        "cost_basis": 1800.0,
        "sector": "Technology",
        "industry": "Consumer Electronics",
    },
    {
        "ticker": "MSFT",
        "qty": 5.0,
        "entry_price": 400.0,
        "current_price": 390.0,
        "market_value": 1950.0,
        "unrealized_pnl": -50.0,
        "unrealized_pnl_pct": -2.5,
        "cost_basis": 2000.0,
        "sector": "Technology",
        "industry": "Software",
    },
]

FAKE_ALPACA_POSITIONS_RAW = [
    {
        "symbol": "AAPL",
        "qty": "10",
        "avg_entry_price": "180.00",
        "current_price": "200.00",
        "market_value": "2000.00",
        "unrealized_pl": "200.00",
        "unrealized_plpc": "0.1111",
        "cost_basis": "1800.00",
    },
    {
        "symbol": "MSFT",
        "qty": "5",
        "avg_entry_price": "400.00",
        "current_price": "390.00",
        "market_value": "1950.00",
        "unrealized_pl": "-50.00",
        "unrealized_plpc": "-0.025",
        "cost_basis": "2000.00",
    },
]

FAKE_ALPACA_ACCOUNT_RAW = {
    "equity": "105000.00",
    "cash": "42000.00",
    "portfolio_value": "105000.00",
    "buying_power": "84000.00",
    "daytrade_count": 0,
    "pattern_day_trader": False,
    "account_blocked": False,
    "status": "ACTIVE",
}


def make_snapshots(equities: list[float]) -> list[dict]:
    snaps = []
    for i, eq in enumerate(equities):
        snaps.append({
            "timestamp": f"2026-03-{20 + i:02d}T10:00:00+00:00",
            "account": {**FAKE_ACCOUNT, "equity": eq},
            "positions": FAKE_POSITIONS,
        })
    return snaps


# ─── get_account ────────────────────────────────────────────────────────────

def test_get_account_parses_response():
    with patch.object(pt, "alpaca_get", return_value=FAKE_ALPACA_ACCOUNT_RAW):
        result = pt.get_account()
    assert result["equity"] == 105000.0
    assert result["cash"] == 42000.0
    assert result["portfolio_value"] == 105000.0


def test_get_account_passes_through_error():
    with patch.object(pt, "alpaca_get", return_value={"error": "Unauthorized", "status": 401}):
        result = pt.get_account()
    assert "error" in result


# ─── get_positions ───────────────────────────────────────────────────────────

def test_get_positions_parses_list():
    with patch.object(pt, "alpaca_get", return_value=FAKE_ALPACA_POSITIONS_RAW):
        positions = pt.get_positions()
    assert len(positions) == 2
    aapl = next(p for p in positions if p["ticker"] == "AAPL")
    assert aapl["qty"] == 10.0
    assert aapl["entry_price"] == 180.0
    assert aapl["current_price"] == 200.0
    assert aapl["unrealized_pnl"] == 200.0
    assert round(aapl["unrealized_pnl_pct"], 2) == 11.11


def test_get_positions_returns_empty_on_error():
    with patch.object(pt, "alpaca_get", return_value={"error": "Unauthorized"}):
        positions = pt.get_positions()
    assert positions == []


def test_get_positions_returns_empty_list_from_api():
    with patch.object(pt, "alpaca_get", return_value=[]):
        positions = pt.get_positions()
    assert positions == []


# ─── calc_max_drawdown ───────────────────────────────────────────────────────

def test_max_drawdown_flat():
    snaps = make_snapshots([100000, 100000, 100000])
    assert pt.calc_max_drawdown(snaps) == 0.0


def test_max_drawdown_monotonic_up():
    snaps = make_snapshots([100000, 102000, 105000])
    assert pt.calc_max_drawdown(snaps) == 0.0


def test_max_drawdown_single_dip():
    snaps = make_snapshots([100000, 90000, 95000])
    # Peak 100000, trough 90000 → 10% drawdown
    assert pt.calc_max_drawdown(snaps) == 10.0


def test_max_drawdown_new_peak_resets():
    snaps = make_snapshots([100000, 90000, 110000, 99000])
    # Peak 110000, trough 99000 → 10% drawdown
    assert pt.calc_max_drawdown(snaps) == 10.0


def test_max_drawdown_single_snapshot():
    snaps = make_snapshots([100000])
    assert pt.calc_max_drawdown(snaps) == 0.0


# ─── calc_return ────────────────────────────────────────────────────────────

def test_calc_return_single_snapshot():
    snaps = make_snapshots([100000])
    result = pt.calc_return(snaps, days=1)
    # Single snap: references itself → 0 change
    assert result == 0.0 or result is None


def test_calc_return_two_snapshots_positive():
    snaps = make_snapshots([100000, 101000])
    result = pt.calc_return(snaps, days=7)
    assert result == 1.0  # 1% gain


def test_calc_return_two_snapshots_negative():
    snaps = make_snapshots([100000, 97000])
    result = pt.calc_return(snaps, days=7)
    assert result == -3.0


# ─── calc_allocation ────────────────────────────────────────────────────────

def test_calc_allocation_sums_correctly():
    total = 4000.0
    alloc = pt.calc_allocation(FAKE_POSITIONS, total)
    assert len(alloc) == 2
    weights = [a["weight_pct"] for a in alloc]
    # AAPL: 2000/4000 = 50%, MSFT: 1950/4000 = 48.75%
    assert abs(weights[0] - 50.0) < 0.1
    assert abs(weights[1] - 48.75) < 0.1


def test_calc_allocation_sorted_descending():
    total = 4000.0
    alloc = pt.calc_allocation(FAKE_POSITIONS, total)
    values = [a["market_value"] for a in alloc]
    assert values == sorted(values, reverse=True)


def test_calc_allocation_zero_total():
    alloc = pt.calc_allocation(FAKE_POSITIONS, total_value=0)
    for a in alloc:
        assert a["weight_pct"] == 0


# ─── cmd_snapshot ────────────────────────────────────────────────────────────

def test_cmd_snapshot_saves_and_returns_summary(tmp_path):
    pt.PORTFOLIO_DIR = tmp_path
    pt.SNAPSHOTS_FILE = tmp_path / "snapshots.json"

    with patch.object(pt, "get_account", return_value=FAKE_ACCOUNT), \
         patch.object(pt, "get_positions", return_value=FAKE_POSITIONS), \
         patch.object(pt, "enrich_with_sector", side_effect=lambda x: x):
        result = pt.cmd_snapshot()

    assert result["snapshot_taken"] is True
    assert result["equity"] == 105000.0
    assert result["positions_count"] == 2
    assert result["total_unrealized_pnl"] == 150.0  # 200 - 50

    saved = json.loads((tmp_path / "snapshots.json").read_text())
    assert len(saved) == 1


def test_cmd_snapshot_appends_to_existing(tmp_path):
    pt.PORTFOLIO_DIR = tmp_path
    pt.SNAPSHOTS_FILE = tmp_path / "snapshots.json"

    existing = make_snapshots([100000, 102000])
    (tmp_path / "snapshots.json").write_text(json.dumps(existing))

    with patch.object(pt, "get_account", return_value=FAKE_ACCOUNT), \
         patch.object(pt, "get_positions", return_value=FAKE_POSITIONS), \
         patch.object(pt, "enrich_with_sector", side_effect=lambda x: x):
        pt.cmd_snapshot()

    saved = json.loads((tmp_path / "snapshots.json").read_text())
    assert len(saved) == 3


def test_cmd_snapshot_propagates_alpaca_error(tmp_path):
    pt.PORTFOLIO_DIR = tmp_path
    pt.SNAPSHOTS_FILE = tmp_path / "snapshots.json"

    with patch.object(pt, "get_account", return_value={"error": "Unauthorized"}):
        result = pt.cmd_snapshot()

    assert "error" in result


# ─── cmd_summary ────────────────────────────────────────────────────────────

def test_cmd_summary_no_snapshots(tmp_path):
    pt.PORTFOLIO_DIR = tmp_path
    pt.SNAPSHOTS_FILE = tmp_path / "snapshots.json"
    result = pt.cmd_summary()
    assert "error" in result


def test_cmd_summary_returns_all_sections(tmp_path):
    pt.PORTFOLIO_DIR = tmp_path
    pt.SNAPSHOTS_FILE = tmp_path / "snapshots.json"

    snaps = make_snapshots([100000, 103000, 105000])
    (tmp_path / "snapshots.json").write_text(json.dumps(snaps))

    result = pt.cmd_summary()

    assert "account" in result
    assert "positions" in result
    assert "totals" in result
    assert "performance" in result
    assert "sector_allocation" in result
    assert "allocation" in result
    assert result["performance"]["max_drawdown_pct"] == 0.0


def test_cmd_summary_pnl_totals(tmp_path):
    pt.PORTFOLIO_DIR = tmp_path
    pt.SNAPSHOTS_FILE = tmp_path / "snapshots.json"

    snaps = [{"timestamp": "2026-03-29T10:00:00+00:00", "account": FAKE_ACCOUNT, "positions": FAKE_POSITIONS}]
    (tmp_path / "snapshots.json").write_text(json.dumps(snaps))

    result = pt.cmd_summary()
    # AAPL: +200, MSFT: -50 → net +150
    assert result["totals"]["unrealized_pnl"] == 150.0


# ─── cmd_history ─────────────────────────────────────────────────────────────

def test_cmd_history_no_snapshots(tmp_path):
    pt.PORTFOLIO_DIR = tmp_path
    pt.SNAPSHOTS_FILE = tmp_path / "snapshots.json"
    result = pt.cmd_history()
    assert "error" in result


def test_cmd_history_returns_records(tmp_path):
    pt.PORTFOLIO_DIR = tmp_path
    pt.SNAPSHOTS_FILE = tmp_path / "snapshots.json"

    snaps = make_snapshots([100000, 101000, 99000])
    (tmp_path / "snapshots.json").write_text(json.dumps(snaps))

    result = pt.cmd_history()
    assert result["snapshots"] == 3
    assert len(result["history"]) == 3
    # First record: day_return 0 (no previous)
    assert result["history"][0]["day_return_pct"] == 0.0
    # Second: +1%
    assert result["history"][1]["day_return_pct"] == pytest.approx(1.0, abs=0.01)
    # Third: -2/101 ≈ -1.98%
    assert result["history"][2]["day_return_pct"] < 0


# ─── cmd_export ──────────────────────────────────────────────────────────────

def test_cmd_export_writes_csv(tmp_path):
    pt.PORTFOLIO_DIR = tmp_path
    pt.SNAPSHOTS_FILE = tmp_path / "snapshots.json"

    snaps = [{"timestamp": "2026-03-29T10:00:00+00:00", "account": FAKE_ACCOUNT, "positions": FAKE_POSITIONS}]
    (tmp_path / "snapshots.json").write_text(json.dumps(snaps))

    result = pt.cmd_export()
    assert result["positions"] == 2
    csv_path = Path(result["exported"])
    assert csv_path.exists()
    content = csv_path.read_text()
    assert "AAPL" in content
    assert "MSFT" in content


def test_cmd_export_no_snapshots(tmp_path):
    pt.PORTFOLIO_DIR = tmp_path
    pt.SNAPSHOTS_FILE = tmp_path / "snapshots.json"
    result = pt.cmd_export()
    assert "error" in result


# ─── cmd_chart_data ──────────────────────────────────────────────────────────

def test_cmd_chart_data_structure(tmp_path):
    pt.PORTFOLIO_DIR = tmp_path
    pt.SNAPSHOTS_FILE = tmp_path / "snapshots.json"

    snaps = make_snapshots([100000, 103000])
    (tmp_path / "snapshots.json").write_text(json.dumps(snaps))

    result = pt.cmd_chart_data()
    assert "equity_curve" in result
    assert "allocation_pie" in result
    assert "pnl_bar" in result
    assert len(result["equity_curve"]) == 2
    assert result["equity_curve"][0]["equity"] == 100000


def test_cmd_chart_data_cash_slice_present(tmp_path):
    pt.PORTFOLIO_DIR = tmp_path
    pt.SNAPSHOTS_FILE = tmp_path / "snapshots.json"

    snaps = [{"timestamp": "2026-03-29T10:00:00+00:00", "account": FAKE_ACCOUNT, "positions": FAKE_POSITIONS}]
    (tmp_path / "snapshots.json").write_text(json.dumps(snaps))

    result = pt.cmd_chart_data()
    tickers = [e["ticker"] for e in result["allocation_pie"]]
    assert "CASH" in tickers


# ─── cmd_reset ───────────────────────────────────────────────────────────────

def test_cmd_reset_clears_snapshots(tmp_path):
    pt.PORTFOLIO_DIR = tmp_path
    pt.SNAPSHOTS_FILE = tmp_path / "snapshots.json"

    snaps = make_snapshots([100000, 102000, 105000])
    (tmp_path / "snapshots.json").write_text(json.dumps(snaps))

    result = pt.cmd_reset()
    assert result["cleared_snapshots"] == 3
    saved = json.loads((tmp_path / "snapshots.json").read_text())
    assert saved == []
