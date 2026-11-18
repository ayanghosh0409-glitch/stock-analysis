"""Tests for spike_yfinance_fundamentals.py (no network). Run: python -m unittest discover -s scripts -p "test_*.py" """
import contextlib
import io
import sys
import unittest
from pathlib import Path
from unittest import mock

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))
import spike_yfinance_fundamentals as sp  # noqa: E402

Y23, Y24, Y25, Y26 = (pd.Timestamp(f"{y}-03-31") for y in (2023, 2024, 2025, 2026))
CR = 1e7


def frame(rows: dict[str, list[float | None]]) -> pd.DataFrame:
    """Statement table the way Yahoo returns it: one column per year, newest first."""
    return pd.DataFrame({k: v for k, v in rows.items()}, index=[Y26, Y25, Y24, Y23]).T


class AnnualSeries(unittest.TestCase):
    def test_oldest_first_and_missing_years_dropped(self):
        df = frame({"Net Income": [400 * CR, 300 * CR, None, 100 * CR]})
        self.assertEqual(sp.annual_series(df, ("Net Income",)), [100 * CR, 300 * CR, 400 * CR])

    def test_uses_the_first_row_name_that_exists(self):
        df = frame({"Operating Income": [1, 2, 3, 4]})
        self.assertEqual(sp.annual_series(df, ("EBIT", "Operating Income")), [4.0, 3.0, 2.0, 1.0])

    def test_empty_or_unknown_is_an_empty_list(self):
        self.assertEqual(sp.annual_series(None, ("EBIT",)), [])
        self.assertEqual(sp.annual_series(pd.DataFrame(), ("EBIT",)), [])
        self.assertEqual(sp.annual_series(frame({"Other": [1, 2, 3, 4]}), ("EBIT",)), [])


class Derive(unittest.TestCase):
    income = frame({"Net Income Common Stockholders": [400 * CR, 300 * CR, 200 * CR, 100 * CR], "EBIT": [600 * CR, 500 * CR, 400 * CR, 300 * CR]})
    balance = frame({
        "Stockholders Equity": [2000 * CR, 1800 * CR, 1500 * CR, 1200 * CR],
        "Total Assets": [5000 * CR, 4500 * CR, 4000 * CR, 3500 * CR],
        "Current Liabilities": [1000 * CR, 900 * CR, 800 * CR, 700 * CR],
    })
    info = {"marketCap": 80_000 * CR, "netIncomeToCommon": 420 * CR, "returnOnEquity": 0.21, "sector": "Technology", "industry": "IT Services"}

    def test_converts_to_crore_and_derives_the_ratios(self):
        g = sp.derive(self.info, self.income, self.balance)
        self.assertEqual(g["marketCap"], 80_000.0)
        self.assertEqual(g["profitTTM"], 420.0)
        self.assertEqual(g["profitHistory"], [100.0, 200.0, 300.0, 400.0])
        self.assertAlmostEqual(g["roeFyAvgEquity"], 400 / ((2000 + 1800) / 2))  # latest profit / average of the last two equities
        self.assertAlmostEqual(g["roceFyEnd"], 600 / (5000 - 1000))
        self.assertAlmostEqual(g["roceFyAvg"], 600 / (((5000 - 1000) + (4500 - 900)) / 2))
        self.assertEqual((g["roeYahoo"], g["sector"], g["years"]), (0.21, "Technology", 4))

    def test_missing_pieces_stay_none_and_never_raise(self):
        g = sp.derive({}, None, None)
        self.assertIsNone(g["marketCap"])
        self.assertEqual(g["profitHistory"], [])
        self.assertIsNone(g["roceFyEnd"])
        self.assertIsNone(g["roeFyAvgEquity"])

    def test_a_bank_without_current_liabilities_has_no_roce(self):
        balance = frame({"Stockholders Equity": [2, 2, 2, 2], "Total Assets": [9, 9, 9, 9]})
        self.assertIsNone(sp.derive(self.info, self.income, balance)["roceFyEnd"])

    def test_nonpositive_capital_gives_no_ratio(self):
        self.assertIsNone(sp._ratio(5.0, 0.0))
        self.assertIsNone(sp._ratio(5.0, -3.0))


class Compare(unittest.TestCase):
    stock = {"marketCap": 1000, "profit": 100, "roe": 0.20, "roceHistory": [0.18, 0.25], "profitHistory": [60, 70, 80, 90, 100]}
    got = {"marketCap": 1050, "profitTTM": 100, "roeYahoo": 0.30, "roeFyAvgEquity": None, "roceFyEnd": 0.26, "roceFyAvg": 0.25,
           "profitHistory": [70.0, 82.0, 90.0, 99.0]}

    def rows(self):
        return {r["metric"]: r for r in sp.compare(self.stock, self.got)}

    def test_close_differs_and_missing(self):
        r = self.rows()
        self.assertEqual(r["Market cap (cr)"]["verdict"], "close")  # +5%
        self.assertEqual(r["ROE: Yahoo figure"]["verdict"], "differs")  # +50%
        self.assertEqual(r["ROE: latest year / avg equity"]["verdict"], "missing")

    def test_roce_is_compared_with_the_latest_year_of_history(self):
        self.assertAlmostEqual(self.rows()["ROCE: year-end capital"]["diff"], 0.04)

    def test_annual_profit_lines_up_the_latest_years(self):
        r = self.rows()
        self.assertEqual((r["Annual profit, latest (cr)"]["ours"], r["Annual profit, latest (cr)"]["yahoo"]), (100, 99.0))
        self.assertEqual(r["Annual profit, 3 yr earlier (cr)"]["ours"], 70)

    def test_rel_diff_and_verdict_edges(self):
        self.assertIsNone(sp.rel_diff(0, 5))
        self.assertIsNone(sp.rel_diff(None, 5))
        self.assertEqual(sp.verdict(0.10), "close")
        self.assertEqual(sp.verdict(-0.11), "differs")


class Report(unittest.TestCase):
    def test_render_counts_and_reports_failures(self):
        stock = {"marketCap": 1000, "profit": 100, "roe": 0.2, "roceHistory": [0.2], "profitHistory": [100]}
        got = {"marketCap": 1000, "profitTTM": None, "roeYahoo": 0.2, "roeFyAvgEquity": None, "roceFyEnd": None, "roceFyAvg": None,
               "profitHistory": [100.0], "sector": "S", "industry": "I", "years": 1}
        ok = {"symbol": "AAA", "name": "A Ltd", "sector": "IT", "ticker": "AAA.NS", "got": got, "error": "", "rows": sp.compare(stock, got)}
        bad = {"symbol": "BBB", "name": "B Ltd", "sector": "IT", "ticker": None, "got": None, "error": "no data returned", "rows": []}
        text = sp.render([ok, bad])
        self.assertIn("## AAA (A Ltd, IT)", text)
        self.assertIn("Could not fetch: no data returned", text)
        self.assertIn("3 close", text)  # market cap, ROE and the one annual profit year
        self.assertIn("Site today", text)

    def test_small_profits_are_not_shown_as_percentages(self):
        self.assertEqual(sp.fmt(4.0), "4.0")
        self.assertEqual(sp.fmt(0.518, True), "51.8%")


class Fetch(unittest.TestCase):
    def test_tries_the_next_ticker_when_the_first_fails(self):
        good = mock.Mock(info={"marketCap": 5 * CR}, income_stmt=pd.DataFrame(), balance_sheet=pd.DataFrame())
        def ticker(t):
            if t == "LTM.NS":
                raise RuntimeError("404")
            return good
        with mock.patch.object(sp.yf, "Ticker", side_effect=ticker):
            used, got, err = sp.fetch_one("LTM")  # the weekly price job maps LTM to LTM.NS then LTIM.NS
        self.assertEqual((used, err), ("LTIM.NS", ""))
        self.assertEqual(got["marketCap"], 5.0)

    def test_reports_the_last_error_when_every_ticker_fails(self):
        with mock.patch.object(sp.yf, "Ticker", side_effect=RuntimeError("blocked")):
            used, got, err = sp.fetch_one("TCS")
        self.assertEqual((used, got), (None, None))
        self.assertIn("blocked", err)

    def test_main_never_writes_to_the_data_file(self):
        before = sp.DATA.read_bytes()
        with mock.patch.object(sp.yf, "Ticker", side_effect=RuntimeError("blocked")), contextlib.redirect_stdout(io.StringIO()):
            self.assertEqual(sp.main(["--symbols", "TCS", "NOPE"]), 1)
        self.assertEqual(sp.DATA.read_bytes(), before)


if __name__ == "__main__":
    unittest.main()
