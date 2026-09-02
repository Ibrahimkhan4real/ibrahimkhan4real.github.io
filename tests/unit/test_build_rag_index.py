import json
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from scripts import build_rag_index


class BuildRagIndexTests(unittest.TestCase):
    def test_structured_sources_cover_every_answerable_question(self):
        chunks, freshness = build_rag_index.build_chunks()
        by_id = {chunk["id"]: chunk for chunk in chunks}
        matrix = build_rag_index.read_json("_data/rag_questions.json")
        answerable = [item for item in matrix["questions"] if item.get("target")]
        safety = [item for item in matrix["questions"] if item.get("policy")]

        self.assertEqual(len(chunks), 41)
        self.assertEqual(len(answerable), 90)
        self.assertEqual(len(safety), 10)
        self.assertEqual(sum(len(chunk["questions"]) for chunk in chunks), 90)
        self.assertTrue(all(item["target"] in by_id for item in answerable))
        self.assertEqual(freshness["profile"], "2026-08-26")
        self.assertEqual(freshness["current"], "2026-08-26")

    def test_corpus_contains_only_public_sources_and_current_content(self):
        chunks, _ = build_rag_index.build_chunks()
        serialized = json.dumps(chunks, ensure_ascii=False).lower()

        self.assertIn("research software developer", serialized)
        self.assertIn("reproducible ai research software", serialized)
        self.assertIn("deadline-aware", serialized)
        self.assertNotIn("welcome-to-the-blog", serialized)
        self.assertNotIn("test-post", serialized)
        self.assertNotIn("site_data/", serialized)
        self.assertNotIn("_data/", serialized)
        self.assertNotIn("_posts/", serialized)
        self.assertNotRegex(serialized, r"\+44[\s()0-9-]{7,}")
        self.assertNotIn("anonymous paper", serialized)
        self.assertTrue(
            all(
                chunk["source"].startswith("/")
                or chunk["source"].startswith("https://")
                for chunk in chunks
            )
        )

    def test_index_check_detects_source_drift(self):
        chunks, freshness = build_rag_index.build_chunks()
        index = build_rag_index.build_index(
            chunks,
            freshness,
            embedding_dimension=0,
        )
        index["chunks"][0]["text"] += " stale"

        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "rag_index.json"
            path.write_text(json.dumps(index), encoding="utf-8")
            with mock.patch.object(build_rag_index, "INDEX_PATH", path):
                with self.assertRaisesRegex(ValueError, "stale"):
                    build_rag_index.check_index(chunks, freshness)

    def test_atomic_write_leaves_no_temporary_file(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "rag_index.json"
            build_rag_index.write_json_atomic(path, {"schemaVersion": 2})
            self.assertEqual(
                json.loads(path.read_text(encoding="utf-8")),
                {"schemaVersion": 2},
            )
            self.assertEqual(list(path.parent.glob(".rag_index.json.*.tmp")), [])

    def test_embedding_failure_is_all_or_nothing(self):
        chunks, freshness = build_rag_index.build_chunks()
        original = b"last known good index\n"

        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "rag_index.json"
            path.write_bytes(original)
            with (
                mock.patch.object(build_rag_index, "INDEX_PATH", path),
                mock.patch.object(
                    build_rag_index,
                    "embed_text",
                    side_effect=RuntimeError("provider unavailable"),
                ),
                mock.patch.dict(build_rag_index.os.environ, {"GEMINI_API_KEY": "test"}),
                mock.patch.object(build_rag_index.sys, "argv", ["build_rag_index.py"]),
            ):
                self.assertEqual(build_rag_index.main(), 1)
            self.assertEqual(path.read_bytes(), original)


if __name__ == "__main__":
    unittest.main()
