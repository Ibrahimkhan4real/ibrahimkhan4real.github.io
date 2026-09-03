#!/usr/bin/env python3
"""Safely refresh the checked-in Google Scholar publication snapshot.

Google Scholar is an opportunistic upstream: it may rate-limit or block hosted
CI runners. A refresh therefore validates the complete replacement in memory
and writes it atomically. --allow-stale lets automation retain a previously
validated snapshot when the upstream is unavailable or returns suspicious data.
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import pathlib
import sys
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request
from html.parser import HTMLParser
from typing import Callable, Dict, List, Optional


SCHOLAR_ROOT = "https://scholar.google.com"
DEFAULT_OUTPUT = pathlib.Path(__file__).resolve().parent.parent / "_data" / "papers.json"
BLOCK_PAGE_MARKERS = ("unusual traffic", "not a robot", "recaptcha")

Publication = Dict[str, Optional[str]]


class ScholarFetchError(RuntimeError):
    """Raised when Scholar cannot provide a usable response."""


class PublicationValidationError(ValueError):
    """Raised when a proposed publication snapshot is unsafe to publish."""


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
        self._entries: List[Publication] = []
        self._current: Optional[Publication] = None
        self._capture: Optional[str] = None
        self._gray_count = 0

    @property
    def entries(self) -> List[Publication]:
        return self._entries

    def handle_starttag(self, tag: str, attrs: List[tuple[str, Optional[str]]]) -> None:
        attr_map = {name: value or "" for name, value in attrs}
        classes = set(attr_map.get("class", "").split())

        if tag == "tr" and "gsc_a_tr" in classes:
            self._current = {
                "title": None,
                "authors": None,
                "venue": None,
                "year": None,
                "citations": None,
                "link": None,
            }
            self._gray_count = 0
            return

        if self._current is None:
            return

        if tag == "a" and "gsc_a_at" in classes:
            self._capture = "title"
            self._current["link"] = urllib.parse.urljoin(
                SCHOLAR_ROOT,
                attr_map.get("href", ""),
            )
            return

        if tag == "a" and "gsc_a_ac" in classes:
            self._capture = "citations"
            return

        if tag == "span" and "gsc_a_h" in classes:
            self._capture = "year"
            return

        if tag == "div" and "gs_gray" in classes:
            self._capture = "authors" if self._gray_count == 0 else "venue"
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
        self._current[self._capture] = f"{current_value} {text}" if current_value else text


def fetch_page(
    url: str,
    delay: float = 1.0,
    attempts: int = 3,
    timeout: float = 20.0,
) -> str:
    """Download one Scholar page with bounded retries and block detection."""
    if delay:
        time.sleep(delay)

    request = urllib.request.Request(
        url,
        headers={
            "Accept-Language": "en-GB,en;q=0.8",
            "User-Agent": (
                "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
                "(KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36"
            ),
        },
    )
    last_error: Optional[BaseException] = None

    for attempt in range(1, attempts + 1):
        try:
            with urllib.request.urlopen(request, timeout=timeout) as response:  # noqa: S310
                html = response.read().decode("utf-8", errors="replace")
            lowered = html.casefold()
            if any(marker in lowered for marker in BLOCK_PAGE_MARKERS):
                raise ScholarFetchError("Google Scholar returned an automated-access block page")
            return html
        except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError, ScholarFetchError) as error:
            last_error = error
            if isinstance(error, urllib.error.HTTPError):
                retryable = error.code in {403, 408, 429} or error.code >= 500
                reason = f"HTTP {error.code}"
            else:
                retryable = True
                reason = str(error.reason) if isinstance(error, urllib.error.URLError) else str(error)

            if not retryable or attempt == attempts:
                raise ScholarFetchError(
                    f"Google Scholar request failed after {attempt} attempt(s): {reason}"
                ) from error
            time.sleep(min(2 ** (attempt - 1), 4))

    raise ScholarFetchError("Google Scholar request failed") from last_error


def collect_publications(scholar_id: str) -> List[Publication]:
    publications: List[Publication] = []
    start = 0
    while True:
        html = fetch_page(build_url(scholar_id, start), delay=0.75 if start else 0.0)
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


def _clean_text(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    cleaned = " ".join(value.replace("\u00a0", " ").split())
    return cleaned or None


def normalize_entry(entry: Publication) -> Publication:
    if not isinstance(entry, dict):
        raise PublicationValidationError("Publication record is not an object")
    return {
        field: _clean_text(entry.get(field))
        for field in ("title", "authors", "venue", "year", "citations", "link")
    }


def validate_scholar_id(scholar_id: str) -> None:
    allowed = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_"
    if not (8 <= len(scholar_id) <= 32) or any(character not in allowed for character in scholar_id):
        raise PublicationValidationError("Scholar ID has an unexpected format")


def validate_publications(
    publications: List[Publication],
    previous: Optional[List[Publication]] = None,
    allow_shrink: bool = False,
) -> None:
    if not publications:
        raise PublicationValidationError("Scholar returned no publication records")

    seen = set()
    maximum_year = dt.datetime.now(dt.timezone.utc).year + 1
    for index, publication in enumerate(publications, start=1):
        if not isinstance(publication, dict):
            raise PublicationValidationError(f"Publication {index} is not an object")

        title = publication.get("title")
        if not isinstance(title, str) or not (3 <= len(title) <= 500):
            raise PublicationValidationError(f"Publication {index} has an invalid title")

        for field in ("authors", "venue", "year", "citations", "link"):
            value = publication.get(field)
            if value is not None and not isinstance(value, str):
                raise PublicationValidationError(
                    f"Publication {index} field {field!r} must be text or null"
                )

        year = publication.get("year")
        if year is not None and (not year.isdigit() or not 1900 <= int(year) <= maximum_year):
            raise PublicationValidationError(f"Publication {index} has an invalid year")

        citations = publication.get("citations")
        if citations is not None and not citations.replace(",", "").isdigit():
            raise PublicationValidationError(f"Publication {index} has an invalid citation count")

        link = publication.get("link")
        if link is not None:
            parsed_link = urllib.parse.urlparse(link)
            if parsed_link.scheme != "https" or not parsed_link.netloc:
                raise PublicationValidationError(
                    f"Publication {index} has a non-HTTPS or malformed link"
                )

        identity = (title.casefold(), year)
        if identity in seen:
            raise PublicationValidationError(
                f"Duplicate publication detected: {title!r} ({year or 'no year'})"
            )
        seen.add(identity)

    if previous and not allow_shrink:
        minimum_safe_count = max(1, (len(previous) + 1) // 2)
        if len(publications) < minimum_safe_count:
            raise PublicationValidationError(
                "Proposed snapshot shrank from "
                f"{len(previous)} to {len(publications)} records; "
                "use --allow-shrink only after manual verification"
            )


def load_snapshot(path: pathlib.Path) -> Optional[dict]:
    if not path.exists():
        return None
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise PublicationValidationError(f"Existing snapshot at {path} is not valid JSON") from error

    if not isinstance(payload, dict):
        raise PublicationValidationError("Existing publication snapshot is not an object")
    publications = payload.get("publications")
    if not isinstance(publications, list):
        raise PublicationValidationError("Existing publication snapshot has no publications list")
    validate_publications(publications, allow_shrink=True)
    if payload.get("count") != len(publications):
        raise PublicationValidationError("Existing publication snapshot count does not match its records")
    return payload


def atomic_write_json(path: pathlib.Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary_path: Optional[pathlib.Path] = None
    try:
        with tempfile.NamedTemporaryFile(
            mode="w",
            encoding="utf-8",
            dir=path.parent,
            prefix=f".{path.name}.",
            suffix=".tmp",
            delete=False,
        ) as temporary_file:
            temporary_path = pathlib.Path(temporary_file.name)
            json.dump(payload, temporary_file, indent=2, ensure_ascii=False)
            temporary_file.write("\n")
        temporary_path.replace(path)
    finally:
        if temporary_path and temporary_path.exists():
            temporary_path.unlink()


def update_dataset(
    scholar_id: str,
    output: pathlib.Path = DEFAULT_OUTPUT,
    allow_stale: bool = False,
    allow_shrink: bool = False,
    collector: Callable[[str], List[Publication]] = collect_publications,
) -> str:
    """Refresh output and return updated, unchanged, or stale."""
    validate_scholar_id(scholar_id)
    existing = load_snapshot(output)
    previous = existing.get("publications") if existing else None

    try:
        publications = [normalize_entry(entry) for entry in collector(scholar_id)]
        validate_publications(publications, previous=previous, allow_shrink=allow_shrink)
    except (ScholarFetchError, PublicationValidationError) as error:
        if allow_stale and existing:
            print(
                f"WARNING: {error}. Keeping the validated last-known-good snapshot at {output}.",
                file=sys.stderr,
            )
            return "stale"
        raise

    if existing and existing.get("scholar_id") == scholar_id and existing.get("publications") == publications:
        print(f"Publication snapshot is unchanged ({len(publications)} records).")
        return "unchanged"

    generated_at = (
        dt.datetime.now(dt.timezone.utc)
        .replace(microsecond=0)
        .isoformat()
        .replace("+00:00", "Z")
    )
    payload = {
        "source": "Google Scholar",
        "scholar_id": scholar_id,
        "generated_at": generated_at,
        "count": len(publications),
        "publications": publications,
    }
    atomic_write_json(output, payload)
    print(f"Wrote {len(publications)} validated publications to {output}")
    return "updated"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Safely update the checked-in publication snapshot from Google Scholar."
    )
    parser.add_argument(
        "--scholar-id",
        required=True,
        help="Google Scholar user identifier (for example, bh9os08AAAAJ)",
    )
    parser.add_argument(
        "--output",
        default=DEFAULT_OUTPUT,
        type=pathlib.Path,
        help="Destination for the generated JSON file.",
    )
    parser.add_argument(
        "--allow-stale",
        action="store_true",
        help="Keep a validated existing snapshot if Scholar is blocked or malformed.",
    )
    parser.add_argument(
        "--allow-shrink",
        action="store_true",
        help="Allow a manually verified reduction of more than half the publication count.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    try:
        update_dataset(
            args.scholar_id,
            output=args.output,
            allow_stale=args.allow_stale,
            allow_shrink=args.allow_shrink,
        )
    except (ScholarFetchError, PublicationValidationError, OSError) as error:
        print(f"ERROR: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
