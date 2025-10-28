#!/usr/bin/env python3
"""Fetch the latest publications from Google Scholar and store them as JSON.

Usage:
    python scripts/update_papers.py --scholar-id bh9os08AAAAJ
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import pathlib
import sys
import time
import urllib.parse
import urllib.request
from html.parser import HTMLParser
from typing import Dict, List, Optional


SCHOLAR_ROOT = "https://scholar.google.com"


def build_url(scholar_id: str, start: int) -> str:
    params = {
        "hl": "en",
        "user": scholar_id,
        "view_op": "list_works",
        "sortby": "pubdate",
        "cstart": str(start),
        "pagesize": "100",
    }
    return f"{SCHOLAR_ROOT}/citations?{urllib.parse.urlencode(params)}"


class ScholarPageParser(HTMLParser):
    """Minimal, dependency-free parser for Google Scholar publication tables."""

    def __init__(self) -> None:
        super().__init__()
        self._entries: List[Dict[str, Optional[str]]] = []
        self._current: Optional[Dict[str, Optional[str]]] = None
        self._capture: Optional[str] = None
        self._gray_count: int = 0

    @property
    def entries(self) -> List[Dict[str, Optional[str]]]:
        return self._entries

    def handle_starttag(self, tag: str, attrs: List[tuple[str, Optional[str]]]) -> None:
        attr_map = {name: value or "" for name, value in attrs}
        classes = set(attr_map.get("class", "").split())

        if tag == "tr" and "gsc_a_tr" in classes:
            self._current = {"title": None, "authors": None, "venue": None, "year": None, "citations": None, "link": None}
            self._gray_count = 0
            return

        if self._current is None:
            return

        if tag == "a" and "gsc_a_at" in classes:
            self._capture = "title"
            href = attr_map.get("href", "")
            self._current["link"] = urllib.parse.urljoin(SCHOLAR_ROOT, href)
            return

        if tag == "a" and "gsc_a_ac" in classes:
            self._capture = "citations"
            return

        if tag == "span" and "gsc_a_h" in classes:
            self._capture = "year"
            return

        if tag == "div" and "gs_gray" in classes:
            field = "authors" if self._gray_count == 0 else "venue"
            self._capture = field
            self._gray_count += 1
            return

        self._capture = None

    def handle_endtag(self, tag: str) -> None:
        if tag == "tr" and self._current is not None:
            self._entries.append(self._current)
            self._current = None
        if self._capture and tag in {"a", "div", "span"}:
            self._capture = None

    def handle_data(self, data: str) -> None:
        if not self._capture or not self._current:
            return
        text = data.strip()
        if not text:
            return
        current_value = self._current.get(self._capture)
        if current_value:
            self._current[self._capture] = f"{current_value} {text}"
        else:
            self._current[self._capture] = text


def fetch_page(url: str, delay: float = 1.0) -> str:
    """Download a single Scholar result page."""
    time.sleep(delay)  # keep it friendly
    request = urllib.request.Request(
        url,
        headers={
            "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
            "(KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
        },
    )
    with urllib.request.urlopen(request) as response:  # noqa: S310 (urllib is fine here)
        return response.read().decode("utf-8")


def collect_publications(scholar_id: str) -> List[Dict[str, Optional[str]]]:
    publications: List[Dict[str, Optional[str]]] = []
    start = 0
    while True:
        url = build_url(scholar_id, start)
        html = fetch_page(url, delay=0.75 if start else 0.0)
        parser = ScholarPageParser()
        parser.feed(html)
        batch = [entry for entry in parser.entries if entry.get("title")]
        if not batch:
            break
        publications.extend(batch)
        if len(batch) < 100:
            break
        start += 100
    return publications


def normalize_entry(entry: Dict[str, Optional[str]]) -> Dict[str, Optional[str]]:
    cleaned = {
        "title": entry.get("title"),
        "authors": entry.get("authors"),
        "venue": entry.get("venue"),
        "year": entry.get("year"),
        "citations": entry.get("citations"),
        "link": entry.get("link"),
    }
    if cleaned["citations"]:
        cleaned["citations"] = cleaned["citations"].replace("\u00a0", " ").strip()
    if cleaned["year"]:
        cleaned["year"] = cleaned["year"].strip()
    return cleaned


def main() -> int:
    parser = argparse.ArgumentParser(description="Update the papers.json file from Google Scholar.")
    parser.add_argument("--scholar-id", required=True, help="Google Scholar user identifier (e.g. bh9os08AAAAJ)")
    parser.add_argument(
        "--output",
        default=pathlib.Path(__file__).resolve().parent.parent / "site_data" / "papers.json",
        type=pathlib.Path,
        help="Destination for the generated JSON file.",
    )
    args = parser.parse_args()

    publications = [normalize_entry(entry) for entry in collect_publications(args.scholar_id)]
    generated_at = (
        dt.datetime.now(dt.timezone.utc)
        .replace(microsecond=0)
        .isoformat()
        .replace("+00:00", "Z")
    )

    payload = {
        "source": "Google Scholar",
        "scholar_id": args.scholar_id,
        "generated_at": generated_at,
        "count": len(publications),
        "publications": publications,
    }

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Wrote {len(publications)} publications to {args.output}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
