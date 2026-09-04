#!/usr/bin/env python3
"""Build and validate the public RAG corpus bundled with the website Worker.

The builder treats the structured Jekyll data as the source of truth. It never
parses the private CV directly and deliberately excludes private contact,
reference, employer-confidential, anonymous-review, and unpublished material.

Examples:
    python scripts/build_rag_index.py --no-embeddings
    python scripts/build_rag_index.py --check
    GEMINI_API_KEY=... python scripts/build_rag_index.py
"""

from __future__ import annotations

import argparse
import hashlib
import html
import json
import os
import re
import sys
import tempfile
import time
import urllib.error
import urllib.request
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any

import yaml

ROOT = Path(__file__).resolve().parents[1]
INDEX_PATH = ROOT / "worker" / "src" / "rag_index.json"
EMBED_MODEL = "models/gemini-embedding-001"
EMBED_TASK_TYPE = "RETRIEVAL_DOCUMENT"
EMBED_URL = (
    "https://generativelanguage.googleapis.com/v1beta/"
    f"{EMBED_MODEL}:embedContent"
)
SCHEMA_VERSION = 2
MINIMUM_KIND_COUNTS = {
    "profile": 8,
    "research-theme": 4,
    "current": 4,
    "project": 5,
    "publication": 5,
    "blog": 3,
    "concept": 10,
    "resource": 1,
}
BANNED_CORPUS_PATTERNS = (
    re.compile(r"\+44[\s()0-9-]{7,}"),
    re.compile(r"\b(?:home address|phone number|private reference)\b", re.I),
    re.compile(r"\banonymous paper\b", re.I),
    re.compile(r"\bunder review at\b", re.I),
)


def read_yaml(relative_path: str) -> dict[str, Any]:
    path = ROOT / relative_path
    with path.open("r", encoding="utf-8") as handle:
        loaded = yaml.safe_load(handle)
    if not isinstance(loaded, dict):
        raise ValueError(f"{relative_path} must contain a mapping")
    return loaded


def read_json(relative_path: str) -> dict[str, Any]:
    path = ROOT / relative_path
    with path.open("r", encoding="utf-8") as handle:
        loaded = json.load(handle)
    if not isinstance(loaded, dict):
        raise ValueError(f"{relative_path} must contain an object")
    return loaded


def json_ready(value: Any) -> Any:
    if isinstance(value, (date, datetime)):
        return value.isoformat()
    if isinstance(value, dict):
        return {str(key): json_ready(item) for key, item in value.items()}
    if isinstance(value, list):
        return [json_ready(item) for item in value]
    return value


def clean_text(value: Any) -> str:
    text = "" if value is None else str(value)
    text = re.sub(r"<!--.*?-->", " ", text, flags=re.DOTALL)
    text = re.sub(r"\x60\x60\x60.*?\x60\x60\x60", " ", text, flags=re.DOTALL)
    text = re.sub(r"!\[([^\]]*)\]\([^)]+\)", r"\1", text)
    text = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", text)
    text = re.sub(r"<[^>]+>", " ", text)
    text = re.sub(r"^#{1,6}\s+", "", text, flags=re.MULTILINE)
    text = re.sub(r"^\s*(?:[-*+]|\d+[.)])\s+", "", text, flags=re.MULTILINE)
    text = text.replace("**", "").replace("__", "").replace(chr(96), "")
    text = html.unescape(text)
    return re.sub(r"\s+", " ", text).strip()


def slugify(value: str) -> str:
    value = value.lower().replace("’", "").replace("'", "")
    value = re.sub(r"[^a-z0-9]+", "-", value)
    return value.strip("-")


def sentence(value: Any) -> str:
    text = clean_text(value)
    if not text:
        return ""
    return text if text.endswith((".", "!", "?")) else f"{text}."


def list_text(values: list[Any]) -> str:
    cleaned = [clean_text(value) for value in values if clean_text(value)]
    return ", ".join(cleaned)


def make_chunk(
    chunk_id: str,
    kind: str,
    title: str,
    text: str,
    source: str,
    *,
    updated_at: str,
    priority: int,
    keywords: list[str] | None = None,
    facts: dict[str, Any] | None = None,
) -> dict[str, Any]:
    chunk = {
        "id": chunk_id,
        "kind": kind,
        "title": clean_text(title),
        "text": clean_text(text),
        "source": source,
        "updatedAt": str(updated_at),
        "priority": priority,
        "keywords": sorted({clean_text(word) for word in (keywords or []) if clean_text(word)}),
        "questions": [],
        "audience": [],
    }
    if facts:
        chunk["facts"] = json_ready(facts)
    return chunk


def profile_chunks(profile: dict[str, Any]) -> list[dict[str, Any]]:
    verified = str(profile["last_verified"])
    identity = profile["identity"]
    bio = profile["bio"]
    links = profile["links"]
    chunks: list[dict[str, Any]] = []

    aliases = list_text(identity.get("aliases", []))
    chunks.append(
        make_chunk(
            "profile-about",
            "profile",
            "About Muhammad Ibrahim Khan",
            (
                f"{identity['full_name']} publishes as {identity['display_name']}. "
                f"Public names: {aliases}. {profile['headline']}. "
                f"{sentence(bio['short'])} {sentence(bio['long'])}"
            ),
            "/index.html#about",
            updated_at=verified,
            priority=10,
            keywords=["Ibrahim Khan", "Muhammad Ibrahim Khan", "biography", "background", "researcher"],
            facts={
                "fullName": identity["full_name"],
                "displayName": identity["display_name"],
                "aliases": identity.get("aliases", []),
                "headline": profile["headline"],
            },
        )
    )

    role_parts = []
    for role in profile.get("current_roles", []):
        role_parts.append(
            f"{role['title']} at {role['organisation']}, {role['unit']}, "
            f"{role['dates']}. {sentence(role['summary'])}"
        )
    affiliation_parts = [
        f"{item['name']}, {item['unit']}, {item['location']}"
        for item in profile.get("affiliations", [])
    ]
    chunks.append(
        make_chunk(
            "profile-roles",
            "profile",
            "Current roles and affiliations",
            " ".join(role_parts)
            + " Public institutional affiliations: "
            + "; ".join(affiliation_parts)
            + ".",
            "/work.html#roles",
            updated_at=verified,
            priority=10,
            keywords=["current role", "job", "work", "UCL", "Coventry University", "affiliation"],
            facts={"roles": profile.get("current_roles", []), "affiliations": profile.get("affiliations", [])},
        )
    )

    education_parts = []
    for item in profile.get("education", []):
        detail = (
            f"{item['award']} in {item['field']} at {item['institution']}, "
            f"{item['dates']}."
        )
        if item.get("thesis"):
            detail += f" Thesis: {item['thesis']}."
        if item.get("supervisor"):
            detail += f" Publicly listed supervisor: {item['supervisor']}."
        if item.get("project"):
            detail += f" Project: {item['project']}."
        education_parts.append(detail)
    chunks.append(
        make_chunk(
            "profile-education",
            "profile",
            "Education",
            " ".join(education_parts),
            "/index.html#about",
            updated_at=verified,
            priority=10,
            keywords=["education", "PhD", "degree", "graduation", "supervisor", "NUST", "Coventry"],
            facts={"education": profile.get("education", [])},
        )
    )

    for theme in profile.get("research_themes", []):
        theme_id = slugify(theme["title"])
        chunks.append(
            make_chunk(
                f"research-theme-{theme_id}",
                "research-theme",
                theme["title"],
                f"{sentence(theme['summary'])} Methods and topics: {theme['methods']}.",
                "/work.html#research-questions",
                updated_at=verified,
                priority=9,
                keywords=[theme["title"], *re.split(r"\s*[·]\s*", theme["methods"])],
            )
        )

    experience_parts = []
    for item in profile.get("experience", []):
        experience_parts.append(
            f"{item['title']} at {item['organisation']} in {item['location']}, "
            f"{item['dates']}. {' '.join(sentence(value) for value in item.get('highlights', []))}"
        )
    chunks.append(
        make_chunk(
            "profile-experience",
            "profile",
            "Professional experience",
            " ".join(experience_parts),
            "/work.html#industry",
            updated_at=verified,
            priority=9,
            keywords=["experience", "CureMD", "AI engineer", "production RAG", "code assistant"],
            facts={"experience": profile.get("experience", [])},
        )
    )

    teaching_parts = [
        f"{item['title']} at {item['organisation']}, {item['dates']}. {sentence(item['summary'])}"
        for item in profile.get("teaching", [])
    ]
    chunks.append(
        make_chunk(
            "profile-teaching",
            "profile",
            "Teaching",
            " ".join(teaching_parts),
            "/work.html#teaching",
            updated_at=verified,
            priority=8,
            keywords=["teaching", "lab demonstrator", "students", "grading"],
            facts={"teaching": profile.get("teaching", [])},
        )
    )

    recognition_parts = []
    for item in profile.get("professional_recognition", []):
        organisation = f", {item['organisation']}" if item.get("organisation") else ""
        detail = f" {sentence(item['detail'])}" if item.get("detail") else ""
        recognition_parts.append(f"{item['title']}{organisation}, {item['year']}.{detail}")
    chunks.append(
        make_chunk(
            "profile-recognition",
            "profile",
            "Professional recognition and awards",
            " ".join(recognition_parts),
            "/work.html#recognition",
            updated_at=verified,
            priority=8,
            keywords=["awards", "recognition", "Advance HE", "Turing Scheme", "innovation award"],
            facts={"recognition": profile.get("professional_recognition", [])},
        )
    )

    chunks.append(
        make_chunk(
            "profile-service",
            "profile",
            "Talks and professional service",
            " ".join(sentence(value) for value in profile.get("talks_and_service", [])),
            "/work.html#teaching",
            updated_at=verified,
            priority=7,
            keywords=["talks", "presentations", "symposium", "reviewer", "service"],
            facts={"service": profile.get("talks_and_service", [])},
        )
    )

    skill_parts = []
    for group, values in profile.get("skills", {}).items():
        skill_parts.append(f"{group.replace('_', ' ').title()}: {list_text(values)}.")
    chunks.append(
        make_chunk(
            "profile-skills",
            "profile",
            "Technical skills",
            " ".join(skill_parts),
            "/work.html#skills",
            updated_at=verified,
            priority=8,
            keywords=["skills", "Python", "Docker", "machine learning", "control", "research software"],
            facts={"skills": profile.get("skills", {})},
        )
    )

    chunks.append(
        make_chunk(
            "profile-contact",
            "profile",
            "Public contact and profile links",
            (
                f"Public email: {profile['contact']['email']}. "
                f"Website: {links['website']}. CV: {links['cv']}. "
                f"Google Scholar: {links['scholar']}. GitHub: {links['github']}. "
                f"LinkedIn: {links['linkedin']}."
            ),
            "/index.html#contact",
            updated_at=verified,
            priority=10,
            keywords=["contact", "email", "CV", "resume", "GitHub", "LinkedIn", "Google Scholar"],
            facts={"email": profile["contact"]["email"], "links": links},
        )
    )
    return chunks


def current_chunks(now: dict[str, Any]) -> list[dict[str, Any]]:
    updated = str(now["updated"])
    chunks = [
        make_chunk(
            "current-summary",
            "current",
            now["update_title"],
            now["summary"],
            "/live.html",
            updated_at=updated,
            priority=10,
            keywords=["current work", "now", "working on", "research direction"],
            facts={"updated": updated, "streamIds": [item["id"] for item in now.get("streams", [])]},
        )
    ]
    for stream in now.get("streams", []):
        text = (
            f"Status: {stream['status']}. Research question: {sentence(stream['question'])} "
            f"Current focus: {sentence(stream['current_focus'])} "
            f"Why it matters: {sentence(stream['why_it_matters'])}"
        )
        if stream.get("public_note"):
            text += f" Public scope: {sentence(stream['public_note'])}"
        chunks.append(
            make_chunk(
                f"current-{stream['id']}",
                "current",
                stream["title"],
                text,
                f"/live.html#{stream['id']}",
                updated_at=updated,
                priority=10,
                keywords=[stream["title"], stream["status"], "current work"],
                facts={"status": stream["status"], "links": stream.get("links", [])},
            )
        )
    return chunks


def project_chunks(projects: dict[str, Any]) -> list[dict[str, Any]]:
    verified = str(projects["last_verified"])
    items = projects.get("items", [])
    chunks = [
        make_chunk(
            "projects-summary",
            "project",
            "Selected public software projects",
            "The selected public projects are: "
            + "; ".join(f"{item['title']} — {item['summary']}" for item in items)
            + ".",
            "/work.html#public-projects",
            updated_at=verified,
            priority=9,
            keywords=["projects", "repositories", "open source", "GitHub", "public software"],
            facts={"count": len(items), "githubProfile": projects["github_profile"]},
        )
    ]
    for item in items:
        chunks.append(
            make_chunk(
                f"project-{item['id']}",
                "project",
                item["title"],
                f"{sentence(item['summary'])} {sentence(item['detail'])} Methods: {list_text(item.get('methods', []))}.",
                item["repository"],
                updated_at=verified,
                priority=9,
                keywords=[item["title"], item["language"], *item.get("methods", [])],
                facts={
                    "repository": item["repository"],
                    "language": item["language"],
                    "methods": item.get("methods", []),
                },
            )
        )
    return chunks


def publication_chunks(papers: dict[str, Any]) -> list[dict[str, Any]]:
    generated = str(papers["generated_at"])
    items = papers.get("publications", [])
    chunks = [
        make_chunk(
            "publications-summary",
            "publication",
            "Publication overview",
            (
                f"The verified Google Scholar snapshot dated {generated} contains "
                f"{papers['count']} publications. "
                + " ".join(
                    f"{item['title']} ({item['year']}, {item['venue']})."
                    for item in items
                )
            ),
            "/papers.html",
            updated_at=generated,
            priority=10,
            keywords=["publications", "papers", "research outputs", "Google Scholar"],
            facts={
                "count": papers["count"],
                "snapshotDate": generated,
                "latestTitle": items[0]["title"] if items else None,
            },
        )
    ]
    for item in items:
        citations = (
            f" Citation count in the {generated} snapshot: {item['citations']}."
            if item.get("citations") is not None
            else f" The {generated} snapshot does not list a citation count."
        )
        chunks.append(
            make_chunk(
                f"paper-{slugify(item['title'])}",
                "publication",
                item["title"],
                (
                    f"Authors: {item['authors']}. Venue: {item['venue']}. "
                    f"Year: {item['year']}.{citations}"
                ),
                item["link"],
                updated_at=generated,
                priority=9,
                keywords=[item["title"], item["authors"], item["venue"], str(item["year"])],
                facts=json_ready(item) | {"snapshotDate": generated},
            )
        )
    return chunks


def parse_post(path: Path) -> tuple[dict[str, Any], str]:
    raw = path.read_text(encoding="utf-8")
    match = re.match(r"^---\s*\n(.*?)\n---\s*\n?", raw, flags=re.DOTALL)
    if not match:
        return {}, raw
    metadata = yaml.safe_load(match.group(1)) or {}
    return metadata, raw[match.end() :]


def blog_chunks() -> list[dict[str, Any]]:
    posts = []
    for path in sorted((ROOT / "_posts").glob("*.md"), reverse=True):
        match = re.match(r"(\d{4})-(\d{2})-(\d{2})-(.+)\.md$", path.name)
        if not match:
            continue
        metadata, body = parse_post(path)
        post_date = "-".join(match.groups()[:3])
        slug = match.group(4)
        url = f"/{match.group(1)}/{match.group(2)}/{match.group(3)}/{slug}.html"
        posts.append(
            {
                "id": f"blog-{post_date}-{slug}",
                "title": metadata.get("title", slug.replace("-", " ").title()),
                "description": metadata.get("description", ""),
                "date": post_date,
                "url": url,
                "text": clean_text(body),
            }
        )

    latest = posts[0] if posts else None
    chunks = [
        make_chunk(
            "blog-summary",
            "blog",
            "Research Blog",
            (
                f"There are {len(posts)} public Blog posts. "
                + (
                    f"The latest is {latest['title']}, published {latest['date']}. "
                    if latest
                    else ""
                )
                + " ".join(f"{post['title']} ({post['date']})." for post in posts)
            ),
            "/blog.html",
            updated_at=latest["date"] if latest else "unknown",
            priority=9,
            keywords=["Blog", "posts", "latest article", "writing"],
            facts={
                "count": len(posts),
                "latest": (
                    {"title": latest["title"], "date": latest["date"], "url": latest["url"]}
                    if latest
                    else None
                ),
            },
        )
    ]
    for post in posts:
        chunks.append(
            make_chunk(
                post["id"],
                "blog",
                post["title"],
                f"{sentence(post['description'])} {post['text']}",
                post["url"],
                updated_at=post["date"],
                priority=8,
                keywords=[post["title"], post["description"], "Blog"],
                facts={"date": post["date"]},
            )
        )
    return chunks


def reference_chunks(rag: dict[str, Any]) -> list[dict[str, Any]]:
    verified = str(rag["last_verified"])
    chunks = []
    for item in rag.get("explainers", []):
        chunks.append(
            make_chunk(
                f"concept-{item['id']}",
                "concept",
                item["title"],
                f"{sentence(item['plain_definition'])} Why it is relevant here: {sentence(item['relevance'])}",
                item["source_url"],
                updated_at=verified,
                priority=8,
                keywords=[item["title"], *item.get("keywords", [])],
            )
        )
    for item in rag.get("resources", []):
        chunks.append(
            make_chunk(
                item["id"],
                "resource",
                item["title"],
                item["text"],
                item["source_url"],
                updated_at=verified,
                priority=7,
                keywords=item.get("keywords", []),
            )
        )
    return chunks


def attach_question_aliases(
    chunks: list[dict[str, Any]], matrix: dict[str, Any]
) -> None:
    by_id = {chunk["id"]: chunk for chunk in chunks}
    questions = matrix.get("questions", [])
    if len(questions) != 100:
        raise ValueError(f"Expected exactly 100 evaluation questions, found {len(questions)}")
    seen_question_ids: set[str] = set()
    for item in questions:
        question_id = item.get("id")
        if not question_id or question_id in seen_question_ids:
            raise ValueError(f"Duplicate or missing question id: {question_id!r}")
        seen_question_ids.add(question_id)
        target = item.get("target")
        policy = item.get("policy")
        if bool(target) == bool(policy):
            raise ValueError(f"{question_id} must define exactly one of target or policy")
        if target:
            if target not in by_id:
                raise ValueError(f"{question_id} targets missing chunk {target}")
            by_id[target]["questions"].append(clean_text(item["query"]))
            by_id[target]["audience"].append(clean_text(item["audience"]))

    for chunk in chunks:
        chunk["questions"] = sorted(set(chunk["questions"]))
        chunk["audience"] = sorted(set(chunk["audience"]))


def validate_chunks(chunks: list[dict[str, Any]]) -> None:
    ids = [chunk["id"] for chunk in chunks]
    if len(ids) != len(set(ids)):
        duplicates = sorted({chunk_id for chunk_id in ids if ids.count(chunk_id) > 1})
        raise ValueError(f"Duplicate chunk ids: {duplicates}")

    kind_counts: dict[str, int] = {}
    for chunk in chunks:
        for field in ("id", "kind", "title", "text", "source", "updatedAt"):
            if not chunk.get(field):
                raise ValueError(f"{chunk.get('id', '<unknown>')} is missing {field}")
        if not (chunk["source"].startswith("/") or chunk["source"].startswith("https://")):
            raise ValueError(f"{chunk['id']} has a non-public source: {chunk['source']}")
        if any(part in chunk["source"] for part in ("_data/", "_posts/", "worker/", "site_data/")):
            raise ValueError(f"{chunk['id']} exposes an internal source path")
        if not 1 <= int(chunk["priority"]) <= 10:
            raise ValueError(f"{chunk['id']} has an invalid priority")
        kind_counts[chunk["kind"]] = kind_counts.get(chunk["kind"], 0) + 1

        searchable = json.dumps(chunk, ensure_ascii=False)
        for pattern in BANNED_CORPUS_PATTERNS:
            if pattern.search(searchable):
                raise ValueError(f"{chunk['id']} contains excluded private or unpublished text")

    for kind, minimum in MINIMUM_KIND_COUNTS.items():
        actual = kind_counts.get(kind, 0)
        if actual < minimum:
            raise ValueError(f"Expected at least {minimum} {kind} chunks, found {actual}")


def content_hash_for(chunk: dict[str, Any]) -> str:
    payload = {key: value for key, value in chunk.items() if key not in ("embedding", "contentHash")}
    canonical = json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return "sha256:" + hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def build_chunks() -> tuple[list[dict[str, Any]], dict[str, Any]]:
    profile = read_yaml("_data/profile.yml")
    now = read_yaml("_data/now.yml")
    papers = read_json("_data/papers.json")
    projects = read_yaml("_data/projects.yml")
    rag = read_yaml("_data/rag.yml")
    matrix = read_json("_data/rag_questions.json")

    chunks = [
        *profile_chunks(profile),
        *current_chunks(now),
        *project_chunks(projects),
        *publication_chunks(papers),
        *blog_chunks(),
        *reference_chunks(rag),
    ]
    attach_question_aliases(chunks, matrix)
    validate_chunks(chunks)
    for chunk in chunks:
        chunk["contentHash"] = content_hash_for(chunk)

    metadata = {
        "profile": str(profile["last_verified"]),
        "current": str(now["updated"]),
        "projects": str(projects["last_verified"]),
        "publications": str(papers["generated_at"]),
        "rag": str(rag["last_verified"]),
        "evaluation": str(matrix["last_verified"]),
    }
    return chunks, metadata


def corpus_hash(chunks: list[dict[str, Any]], metadata: dict[str, Any]) -> str:
    canonical = json.dumps(
        {"chunks": chunks, "sourceFreshness": metadata},
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    )
    return "sha256:" + hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def embed_text(text: str, api_key: str) -> list[float]:
    payload = json.dumps(
        {
            "model": EMBED_MODEL,
            "taskType": EMBED_TASK_TYPE,
            "content": {"parts": [{"text": text}]},
        }
    ).encode("utf-8")
    request = urllib.request.Request(
        EMBED_URL,
        data=payload,
        headers={"Content-Type": "application/json", "x-goog-api-key": api_key},
        method="POST",
    )
    last_error: Exception | None = None
    for attempt in range(3):
        try:
            with urllib.request.urlopen(request, timeout=30) as response:
                body = json.loads(response.read().decode("utf-8"))
            values = body.get("embedding", {}).get("values")
            if not isinstance(values, list) or not values:
                raise RuntimeError("Embedding response did not contain values")
            return [float(value) for value in values]
        except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, ValueError, RuntimeError) as error:
            last_error = error
            if attempt < 2:
                time.sleep(2**attempt)
    raise RuntimeError(f"Embedding failed after three attempts: {last_error}")


def add_embeddings(chunks: list[dict[str, Any]], api_key: str) -> int:
    if not api_key:
        raise RuntimeError("GEMINI_API_KEY is required unless --no-embeddings or --check is used")
    dimension: int | None = None
    for index, chunk in enumerate(chunks, start=1):
        embed_input = (
            f"{chunk['title']}\n{chunk['text']}\n"
            f"Keywords: {', '.join(chunk['keywords'])}\n"
            f"Example questions: {' | '.join(chunk['questions'])}"
        )
        values = embed_text(embed_input, api_key)
        if dimension is None:
            dimension = len(values)
        elif len(values) != dimension:
            raise RuntimeError(
                f"Embedding dimension changed at {chunk['id']}: {len(values)} != {dimension}"
            )
        chunk["embedding"] = values
        print(f"Embedded {index}/{len(chunks)}: {chunk['id']}", file=sys.stderr)
    return dimension or 0


def add_content_hashes(chunks: list[dict[str, Any]]) -> None:
    for chunk in chunks:
        chunk["contentHash"] = content_hash_for(chunk)


def chunks_without_embeddings(chunks: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [{key: value for key, value in chunk.items() if key != "embedding"} for chunk in chunks]


def build_index(
    chunks: list[dict[str, Any]],
    metadata: dict[str, Any],
    *,
    embedding_dimension: int,
) -> dict[str, Any]:
    return {
        "schemaVersion": SCHEMA_VERSION,
        "generatedAt": datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
        "sourceHash": corpus_hash(chunks_without_embeddings(chunks), metadata),
        "sourceFreshness": metadata,
        "embeddingModel": EMBED_MODEL if embedding_dimension else None,
        "documentTaskType": EMBED_TASK_TYPE if embedding_dimension else None,
        "embeddingDimension": embedding_dimension or None,
        "chunks": chunks,
    }


def write_json_atomic(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporary_name = tempfile.mkstemp(
        dir=path.parent, prefix=f".{path.name}.", suffix=".tmp"
    )
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
            json.dump(payload, handle, ensure_ascii=False, indent=2)
            handle.write("\n")
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary_name, path)
    except Exception:
        try:
            os.unlink(temporary_name)
        except FileNotFoundError:
            pass
        raise


def check_index(chunks: list[dict[str, Any]], metadata: dict[str, Any]) -> None:
    if not INDEX_PATH.exists():
        raise ValueError(f"Missing generated index: {INDEX_PATH}")
    with INDEX_PATH.open("r", encoding="utf-8") as handle:
        index = json.load(handle)

    if index.get("schemaVersion") != SCHEMA_VERSION:
        raise ValueError(
            f"Index schema is {index.get('schemaVersion')}, expected {SCHEMA_VERSION}"
        )
    expected_chunks = chunks_without_embeddings(chunks)
    actual_chunks = chunks_without_embeddings(index.get("chunks", []))
    expected_hash = corpus_hash(expected_chunks, metadata)
    if index.get("sourceHash") != expected_hash or actual_chunks != expected_chunks:
        raise ValueError(
            "RAG index is stale. Run: python scripts/build_rag_index.py --no-embeddings "
            "or rebuild it with GEMINI_API_KEY."
        )

    embeddings = [chunk.get("embedding") for chunk in index.get("chunks", [])]
    populated = [value for value in embeddings if value is not None]
    if populated:
        if len(populated) != len(embeddings):
            raise ValueError("Index contains only a partial set of embeddings")
        dimensions = {len(value) for value in populated if isinstance(value, list)}
        if len(dimensions) != 1 or 0 in dimensions:
            raise ValueError(f"Index embedding dimensions are inconsistent: {dimensions}")
        if index.get("embeddingDimension") not in dimensions:
            raise ValueError("Index embeddingDimension does not match chunk vectors")
    elif any(
        index.get(field)
        for field in ("embeddingModel", "documentTaskType", "embeddingDimension")
    ):
        raise ValueError("Lexical-only index must not claim embedding metadata")

    kind_counts: dict[str, int] = {}
    for chunk in chunks:
        kind_counts[chunk["kind"]] = kind_counts.get(chunk["kind"], 0) + 1
    coverage = ", ".join(f"{kind}={count}" for kind, count in sorted(kind_counts.items()))
    print(
        f"RAG index is current: {len(chunks)} chunks, "
        f"{sum(len(chunk['questions']) for chunk in chunks)} answerable aliases; {coverage}"
    )


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument(
        "--check",
        action="store_true",
        help="validate sources and prove the checked-in index is current without API calls",
    )
    mode.add_argument(
        "--no-embeddings",
        action="store_true",
        help="write a deterministic lexical index without calling Gemini",
    )
    arguments = parser.parse_args()

    try:
        chunks, metadata = build_chunks()
        if arguments.check:
            check_index(chunks, metadata)
            return 0

        dimension = 0
        if not arguments.no_embeddings:
            dimension = add_embeddings(chunks, os.environ.get("GEMINI_API_KEY", ""))
        index = build_index(chunks, metadata, embedding_dimension=dimension)
        write_json_atomic(INDEX_PATH, index)
        print(
            f"Wrote {len(chunks)} complete chunks to {INDEX_PATH} "
            f"({'lexical only' if not dimension else f'{dimension}-dimension embeddings'})"
        )
        return 0
    except (KeyError, OSError, TypeError, ValueError, RuntimeError, yaml.YAMLError) as error:
        print(f"RAG index error: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
