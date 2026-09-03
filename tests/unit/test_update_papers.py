import json
import tempfile
import unittest
from pathlib import Path
from unittest import mock
from urllib.error import HTTPError

from scripts import update_papers


SCHOLAR_ID = "bh9os08AAAAJ"


def publication(number=1, year="2026"):
    return {
        "title": f"Verified publication {number}",
        "authors": "M I Khan",
        "venue": "Example venue",
        "year": year,
        "citations": str(number),
        "link": f"https://scholar.google.com/citations?citation_for_view=test:{number}",
    }


def snapshot(publications):
    return {
        "source": "Google Scholar",
        "scholar_id": SCHOLAR_ID,
        "generated_at": "2026-08-21T07:14:33Z",
        "count": len(publications),
        "publications": publications,
    }


class UpdatePapersTests(unittest.TestCase):
    def setUp(self):
        self.temporary_directory = tempfile.TemporaryDirectory()
        self.data_file = Path(self.temporary_directory.name) / "papers.json"
        self.original_publications = [publication(index) for index in range(1, 5)]
        self.data_file.write_text(
            json.dumps(snapshot(self.original_publications), indent=2) + "\n",
            encoding="utf-8",
        )

    def tearDown(self):
        self.temporary_directory.cleanup()

    def test_parser_extracts_complete_publication(self):
        parser = update_papers.ScholarPageParser()
        parser.feed(
            """
            <table><tr class="gsc_a_tr">
              <td><a class="gsc_a_at" href="/citations?view_op=view_citation">A title</a>
              <div class="gs_gray">M I Khan</div><div class="gs_gray">A venue</div></td>
              <td><a class="gsc_a_ac">12</a></td>
              <td><span class="gsc_a_h">2026</span></td>
            </tr></table>
            """
        )

        self.assertEqual(len(parser.entries), 1)
        self.assertEqual(parser.entries[0]["title"], "A title")
        self.assertEqual(parser.entries[0]["authors"], "M I Khan")
        self.assertEqual(parser.entries[0]["venue"], "A venue")
        self.assertEqual(parser.entries[0]["citations"], "12")
        self.assertEqual(parser.entries[0]["year"], "2026")
        self.assertTrue(parser.entries[0]["link"].startswith(update_papers.SCHOLAR_ROOT))

    def test_fetch_retries_403_then_returns_clear_error(self):
        error = HTTPError("https://example.test", 403, "Forbidden", {}, None)
        with mock.patch.object(
            update_papers.urllib.request,
            "urlopen",
            side_effect=error,
        ), mock.patch.object(update_papers.time, "sleep") as sleep:
            with self.assertRaisesRegex(update_papers.ScholarFetchError, "HTTP 403"):
                update_papers.fetch_page("https://example.test", attempts=3)
        self.assertEqual(sleep.call_count, 3)

    def test_blocked_fetch_preserves_last_known_good_snapshot(self):
        before = self.data_file.read_bytes()

        def blocked(_scholar_id):
            raise update_papers.ScholarFetchError("HTTP 403")

        status = update_papers.update_dataset(
            SCHOLAR_ID,
            output=self.data_file,
            allow_stale=True,
            collector=blocked,
        )
        self.assertEqual(status, "stale")
        self.assertEqual(self.data_file.read_bytes(), before)

    def test_empty_or_severely_shrunken_results_preserve_snapshot(self):
        before = self.data_file.read_bytes()
        for proposed in ([], [publication(9)]):
            with self.subTest(count=len(proposed)):
                status = update_papers.update_dataset(
                    SCHOLAR_ID,
                    output=self.data_file,
                    allow_stale=True,
                    collector=lambda _scholar_id, records=proposed: records,
                )
                self.assertEqual(status, "stale")
                self.assertEqual(self.data_file.read_bytes(), before)

    def test_duplicate_and_malformed_records_are_rejected(self):
        duplicate = publication(1)
        with self.assertRaises(update_papers.PublicationValidationError):
            update_papers.validate_publications([duplicate, duplicate.copy()])
        malformed = publication(2, year="twenty-six")
        with self.assertRaises(update_papers.PublicationValidationError):
            update_papers.validate_publications([malformed])
        with self.assertRaises(update_papers.PublicationValidationError):
            update_papers.normalize_entry("not an object")  # type: ignore[arg-type]

    def test_unchanged_refresh_does_not_rewrite_timestamp_or_file(self):
        before = self.data_file.read_bytes()
        status = update_papers.update_dataset(
            SCHOLAR_ID,
            output=self.data_file,
            collector=lambda _scholar_id: self.original_publications,
        )
        self.assertEqual(status, "unchanged")
        self.assertEqual(self.data_file.read_bytes(), before)

    def test_valid_refresh_is_written_and_counted(self):
        proposed = [publication(index) for index in range(1, 6)]
        status = update_papers.update_dataset(
            SCHOLAR_ID,
            output=self.data_file,
            collector=lambda _scholar_id: proposed,
        )
        written = json.loads(self.data_file.read_text(encoding="utf-8"))
        self.assertEqual(status, "updated")
        self.assertEqual(written["count"], 5)
        self.assertEqual(written["publications"], proposed)
        self.assertNotEqual(written["generated_at"], "2026-08-21T07:14:33Z")
        self.assertEqual(list(self.data_file.parent.glob(".papers.json.*.tmp")), [])


if __name__ == "__main__":
    unittest.main()
