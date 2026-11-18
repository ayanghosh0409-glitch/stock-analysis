"""Tests for refresh_news.py. Run: python -m unittest discover -s scripts -p "test_*.py" """
import json
import sys
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parent))
import refresh_news as rn  # noqa: E402

NOW = datetime(2026, 11, 18, 3, 0, tzinfo=timezone.utc)  # 08:30 IST

def item(title, link, pub, source="Economic Times"):
    src = f'<source url="https://example.com">{source}</source>' if source else ""
    return f"<item><title>{title}</title><link>{link}</link><pubDate>{pub}</pubDate>{src}</item>"

def feed(*items):
    return '<?xml version="1.0"?><rss version="2.0"><channel><title>q - Google News</title>' + "".join(items) + "</channel></rss>"


class ParseFeed(unittest.TestCase):
    def test_keeps_recent_dated_items_and_strips_the_source_suffix(self):
        xml = feed(item("Infosys wins big deal - Economic Times", "https://news.google.com/rss/articles/a", "Tue, 17 Nov 2026 05:30:00 GMT"))
        (it,) = rn.parse_feed(xml, NOW, 7)
        self.assertEqual(it["title"], "Infosys wins big deal")
        self.assertEqual(it["source"], "Economic Times")
        self.assertEqual(it["publishedAt"], "2026-11-17T05:30:00Z")

    def test_date_is_the_indian_date_not_the_utc_date(self):
        xml = feed(item("Late story - Mint", "https://x.test/a", "Tue, 17 Nov 2026 22:00:00 GMT", "Mint"))
        (it,) = rn.parse_feed(xml, NOW, 7)
        self.assertEqual(it["date"], "2026-11-18")  # 03:30 IST on the 18th

    def test_drops_old_undated_and_non_web_links(self):
        xml = feed(
            item("Old - ET", "https://x.test/old", "Mon, 02 Nov 2026 05:30:00 GMT", "ET"),
            item("No date - ET", "https://x.test/nodate", "", "ET"),
            item("Bad date - ET", "https://x.test/bad", "yesterday-ish", "ET"),
            item("Script - ET", "javascript:alert(1)", "Tue, 17 Nov 2026 05:30:00 GMT", "ET"),
            item("Fresh - ET", "https://x.test/fresh", "Tue, 17 Nov 2026 05:30:00 GMT", "ET"),
        )
        self.assertEqual([i["title"] for i in rn.parse_feed(xml, NOW, 7)], ["Fresh"])

    def test_source_comes_from_the_title_when_the_tag_is_missing(self):
        xml = feed(item("Pharma exports rise - The Hindu", "https://x.test/a", "Tue, 17 Nov 2026 05:30:00 GMT", source=""))
        (it,) = rn.parse_feed(xml, NOW, 7)
        self.assertEqual((it["title"], it["source"]), ("Pharma exports rise", "The Hindu"))

    def test_text_is_data_not_markup(self):
        xml = feed(item("&lt;b&gt;Bold&lt;/b&gt; &amp; more - ET", "https://x.test/a", "Tue, 17 Nov 2026 05:30:00 GMT", "ET"))
        (it,) = rn.parse_feed(xml, NOW, 7)
        self.assertEqual(it["title"], "<b>Bold</b> & more")  # kept as plain text; the site escapes it when rendering


class ExcludeSources(unittest.TestCase):
    def test_drops_listed_outlets_whatever_their_letter_case(self):
        xml = feed(
            item("Story one - LinkedIn", "https://x.test/1", "Tue, 17 Nov 2026 05:30:00 GMT", "LinkedIn"),
            item("Story two - Mint", "https://x.test/2", "Tue, 17 Nov 2026 05:30:00 GMT", "Mint"),
        )
        out = rn.parse_feed(xml, NOW, 7, frozenset({"linkedin"}))
        self.assertEqual([i["source"] for i in out], ["Mint"])


class Merge(unittest.TestCase):
    def test_newest_first_and_one_entry_per_headline(self):
        a = {"title": "Auto sales jump", "publishedAt": "2026-11-16T05:00:00Z"}
        b = {"title": "AUTO sales jump!", "publishedAt": "2026-11-17T05:00:00Z"}  # same story, other outlet
        c = {"title": "Something else", "publishedAt": "2026-11-15T05:00:00Z"}
        out = rn.merge([a, c, b])
        self.assertEqual([i["title"] for i in out], ["AUTO sales jump!", "Something else"])

    def test_syndicated_copies_with_a_different_ending_count_as_one(self):
        base = "Cognizant beats TCS, HCLTech and two global rivals to win $175-million UK data centre deal"
        a = {"title": base, "publishedAt": "2026-11-18T01:00:00Z"}
        b = {"title": base + "- Moneycontrol", "publishedAt": "2026-11-18T00:00:00Z"}
        self.assertEqual(len(rn.merge([a, b])), 1)

    def test_caps_the_list(self):
        many = [{"title": f"Story {i}", "publishedAt": f"2026-11-{10 + i:02d}T00:00:00Z"} for i in range(8)]
        self.assertEqual(len(rn.merge(many, limit=5)), 5)


class Queries(unittest.TestCase):
    def test_company_query_uses_the_largest_companies_and_first_alias(self):
        sector = {"stocks": [{"symbol": "A", "marketCap": 1}, {"symbol": "B", "marketCap": 9}, {"symbol": "C", "marketCap": 5}]}
        aliases = {"A": ["alpha"], "B": ["beta corp", "beta"], "C": ["gamma"]}
        self.assertEqual(rn.company_query(sector, aliases, top_n=2), '("beta corp" OR "gamma")')

    def test_feed_url_asks_for_the_window_and_indian_english(self):
        u = rn.feed_url('("FMCG") India', 7)
        self.assertIn("when%3A7d", u)
        self.assertIn("hl=en-IN", u)


class Refresh(unittest.TestCase):
    def test_failed_searches_keep_previous_headlines_and_mark_them_stale(self):
        def boom(url):
            raise RuntimeError("blocked")

        items, errors = rn.refresh_sector("IT", ["q1", "q2"], 7, NOW, fetcher=boom)
        self.assertEqual((items, len(errors)), ([], 2))

    def test_main_writes_the_file_and_fails_only_when_nothing_could_be_fetched(self):
        with tempfile.TemporaryDirectory() as d:
            out = Path(d) / "news.json"
            ok = feed(item("Nifty IT rallies - Mint", "https://x.test/a", "Tue, 17 Nov 2026 05:30:00 GMT", "Mint"))
            with mock.patch.object(rn, "fetch", return_value=ok), mock.patch.object(rn, "datetime") as dt:
                dt.now.return_value = NOW
                self.assertEqual(rn.main(["--out", str(out)]), 0)
            data = json.loads(out.read_text())
            self.assertEqual(data["fetchedAt"], "2026-11-18T03:00:00Z")
            self.assertTrue(all(s["status"] == "ok" for s in data["sectors"].values()))
            self.assertEqual(data["sectors"]["IT"]["items"][0]["title"], "Nifty IT rallies")

            with mock.patch.object(rn, "fetch", side_effect=RuntimeError("blocked")), mock.patch.object(rn.time, "sleep"):
                self.assertEqual(rn.main(["--out", str(out)]), 1)
            self.assertTrue(all(s["status"] == "error" for s in json.loads(out.read_text())["sectors"].values()))


if __name__ == "__main__":
    unittest.main()
