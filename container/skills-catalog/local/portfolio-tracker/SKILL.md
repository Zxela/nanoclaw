---
name: portfolio-tracker
description: Track paper portfolio state across sessions — open positions, realized/unrealized P&L, sector allocation, max drawdown, and daily/weekly returns. Persists snapshots to /workspace/group/portfolio/. Depends on paper-trader (Alpaca) and market-data (Finnhub/yfinance).
---

# Portfolio Tracker Skill

Persistent portfolio tracking for Alpaca paper trading. Takes periodic snapshots, calculates P&L metrics, and exports data for analysis or charting.

## Setup

```bash
ALPACA_API_KEY=<key>        # Alpaca paper trading API key
ALPACA_SECRET_KEY=<secret>  # Alpaca paper trading secret

# Optional — yfinance used for sector enrichment (no API key needed)
# pip install yfinance --quiet
```

**Snapshot storage:** `/workspace/group/portfolio/snapshots.json` (persists across restarts)

Override with `PORTFOLIO_DIR=/path/to/dir`.

## Usage

```bash
TRACKER="$(dirname "$0")/portfolio_tracker.py"
```

### Take a snapshot (live positions + prices)
```bash
python3 "$TRACKER" snapshot
# Fetches live positions from Alpaca, enriches with sector data
# Saves to snapshots.json
```

### Summary (P&L, allocation, drawdown)
```bash
python3 "$TRACKER" summary
```

Returns:
- Account: equity, cash, portfolio value, buying power
- Positions: ticker, qty, entry price, current price, market value, unrealized P&L, sector
- Totals: invested, market value, unrealized P&L %
- Performance: daily/weekly return %, max drawdown %
- Sector allocation breakdown
- Position allocation by weight

### History (equity curve)
```bash
python3 "$TRACKER" history
# Returns all snapshots with per-snapshot day return
```

### Export to CSV
```bash
python3 "$TRACKER" export
# Writes positions_<timestamp>.csv to /workspace/group/portfolio/
```

### Chart-ready data
```bash
python3 "$TRACKER" chart-data
# Returns: equity_curve (for line chart), allocation_pie (for pie chart), pnl_bar (for bar chart)
```

### Reset history
```bash
python3 "$TRACKER" reset
# Clears all snapshots — use before starting a fresh paper trading session
```

## Output format

All commands return JSON. Check for `"error"` key before using results.

```json
// summary (abbreviated)
{
  "as_of": "2026-03-29T10:00:00Z",
  "account": {"equity": 105000, "cash": 42000, "portfolio_value": 105000},
  "totals": {"invested": 61000, "market_value": 63000, "unrealized_pnl": 2000, "unrealized_pnl_pct": 3.28},
  "performance": {"daily_return_pct": 0.42, "weekly_return_pct": 1.87, "max_drawdown_pct": 2.1},
  "sector_allocation": [{"sector": "Technology", "weight_pct": 45.2}, ...],
  "positions": [{"ticker": "AAPL", "qty": 10, "unrealized_pnl_pct": 4.1}, ...]
}
```

## Typical workflow

```bash
# Morning: take snapshot + print summary
python3 "$TRACKER" snapshot
python3 "$TRACKER" summary

# EOD: export CSV for records
python3 "$TRACKER" export

# Weekly: review full equity curve
python3 "$TRACKER" history
```
