#!/usr/bin/env python3
"""Fetch the latest publications from Google Scholar and store them as JSON."""

from __future__ import annotations

import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List

from scholarly import scholarly

REPO_ROOT = Path(__file__).resolve().parents[1]
DATA_PATH = REPO_ROOT / "assets" / "data" / "papers.json"
AUTHOR_ID_ENV = "SCHOLAR_AUTHOR_ID"
MAX_PAPERS = int(os.getenv("SCHOLAR_MAX_PAPERS", "25"))


def fetch_publications(author_id: str) -> List[Dict[str, Any]]:
  """Return a list of publication dictionaries for the author."""
  author = scholarly.search_author_id(author_id)
  author = scholarly.fill(author, sections=["publications"])

  publications: List[Dict[str, Any]] = []

  for publication in author.get("publications", [])[:MAX_PAPERS]:
    try:
      filled = scholarly.fill(publication)
    except Exception as error:  # pylint: disable=broad-except
      print(f"Skipping publication due to error: {error}", file=sys.stderr)
      continue

    bib = filled.get("bib", {})
    entry = {
      "title": bib.get("title", "Untitled"),
      "authors": bib.get("author"),
      "venue": bib.get("venue") or bib.get("journal") or bib.get("publisher"),
      "year": safe_int(bib.get("pub_year")),
      "link": filled.get("pub_url") or filled.get("eprint_url"),
      "cited_by": filled.get("num_citations"),
    }

    publications.append(entry)

  publications.sort(key=lambda item: item.get("year") or 0, reverse=True)
  return publications


def safe_int(value: Any) -> int | None:
  try:
    return int(value)
  except (TypeError, ValueError):
    return None


def write_payload(papers: List[Dict[str, Any]]) -> None:
  payload = {
    "last_updated": datetime.now(timezone.utc).isoformat(),
    "source": "google_scholar",
    "papers": papers,
  }

  DATA_PATH.parent.mkdir(parents=True, exist_ok=True)
  DATA_PATH.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
  print(f"Wrote {len(papers)} papers to {DATA_PATH}")


def main() -> int:
  author_id = os.getenv(AUTHOR_ID_ENV)
  if not author_id:
    print(f"Environment variable {AUTHOR_ID_ENV} is required", file=sys.stderr)
    return 1

  papers = fetch_publications(author_id)
  if not papers:
    print("No publications found for the provided author ID", file=sys.stderr)
    return 1

  write_payload(papers)
  return 0


if __name__ == "__main__":
  raise SystemExit(main())
