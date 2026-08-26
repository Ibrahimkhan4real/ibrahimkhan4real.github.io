import tempfile
import unittest
from pathlib import Path
from unittest import mock

import yaml

from scripts import update_now


class FakeResponse:
    def __init__(self, payload):
        self.payload = payload

    def raise_for_status(self):
        return None

    def json(self):
        return self.payload


class UpdateNowTests(unittest.TestCase):
    def setUp(self):
        self.temporary_directory = tempfile.TemporaryDirectory()
        self.data_file = Path(self.temporary_directory.name) / "now.yml"
        self.data_file.write_text(
            yaml.safe_dump(
                {
                    "schema_version": 2,
                    "updated": "2026-08-01",
                    "summary": "Old summary",
                    "streams": [{"id": "energy-control"}],
                },
                sort_keys=False,
            ),
            encoding="utf-8",
        )
        self.data_file_patch = mock.patch.object(
            update_now,
            "DATA_FILE",
            str(self.data_file),
        )
        self.data_file_patch.start()

    def tearDown(self):
        self.data_file_patch.stop()
        self.temporary_directory.cleanup()

    def test_owner_issue_updates_summary_without_removing_streams(self):
        issue = {
            "number": 42,
            "title": "August research update",
            "body": "  A structured\n  current-work summary.  ",
            "html_url": "https://github.com/example/issues/42",
        }

        self.assertTrue(update_now.update_now_data(issue))
        data = yaml.safe_load(self.data_file.read_text(encoding="utf-8"))
        self.assertEqual(data["summary"], "A structured current-work summary.")
        self.assertEqual(data["update_title"], "August research update")
        self.assertEqual(data["streams"], [{"id": "energy-control"}])
        self.assertEqual(data["source_issue"], "https://github.com/example/issues/42")

    def test_missing_issue_leaves_file_unchanged(self):
        before = self.data_file.read_text(encoding="utf-8")
        self.assertFalse(update_now.update_now_data(None))
        self.assertEqual(self.data_file.read_text(encoding="utf-8"), before)

    def test_summary_validation_rejects_empty_or_oversized_content(self):
        with self.assertRaises(ValueError):
            update_now.clean_summary("   ")
        with self.assertRaises(ValueError):
            update_now.clean_summary("x" * (update_now.MAX_SUMMARY_LENGTH + 1))

    @mock.patch.object(update_now.requests, "get")
    def test_fetch_ignores_pull_requests_and_non_owner_issues(self, get):
        owner_issue = {
            "number": 3,
            "user": {"login": update_now.REPO_OWNER},
        }
        get.return_value = FakeResponse(
            [
                {"number": 1, "pull_request": {}, "user": {"login": update_now.REPO_OWNER}},
                {"number": 2, "user": {"login": "someone-else"}},
                owner_issue,
            ]
        )

        self.assertEqual(update_now.fetch_latest_issue(), owner_issue)
        _, kwargs = get.call_args
        self.assertEqual(kwargs["timeout"], 20)
        self.assertEqual(kwargs["params"]["labels"], update_now.ISSUE_LABEL)


if __name__ == "__main__":
    unittest.main()
