#!/usr/bin/env python3
"""
Build a RAG index for the chatbot Cloudflare Worker.

Reads site content (profile, papers, blog posts, status), chunks it,
generates embeddings via Google Gemini embedding API, and writes a
JSON index file that the Worker bundles at deploy time.

Usage:
    export GEMINI_API_KEY="your-key"
    python scripts/build_rag_index.py

Output:
    worker/src/rag_index.json
"""

import argparse
import html
import json
import os
import re
import sys
import urllib.request
import urllib.error

GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")
EMBED_MODEL = "models/gemini-embedding-001"
EMBED_URL = f"https://generativelanguage.googleapis.com/v1beta/{EMBED_MODEL}:embedContent?key={GEMINI_API_KEY}"

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def strip_html(text):
    """Remove HTML tags and collapse whitespace."""
    text = re.sub(r"<[^>]+>", " ", text)
    text = html.unescape(text)
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def read_file(rel_path):
    path = os.path.join(ROOT, rel_path)
    if not os.path.exists(path):
        return None
    with open(path, "r", encoding="utf-8") as f:
        return f.read()


def parse_front_matter(content):
    """Return simple Jekyll front matter fields and the Markdown body."""
    match = re.match(r"^---\s*\n(.*?)\n---\s*\n?", content, flags=re.DOTALL)
    if not match:
        return {}, content

    metadata = {}
    for line in match.group(1).splitlines():
        key, separator, value = line.partition(":")
        if separator:
            metadata[key.strip()] = value.strip().strip('"').strip("'")
    return metadata, content[match.end():]


def clean_markdown(content):
    """Turn Markdown and inline HTML into readable retrieval text."""
    content = re.sub(r"<!--.*?-->", " ", content, flags=re.DOTALL)
    content = re.sub(r"\x60\x60\x60.*?\x60\x60\x60", " ", content, flags=re.DOTALL)
    content = re.sub(r"!\[([^\]]*)\]\([^)]+\)", r"\1", content)
    content = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", content)
    content = re.sub(r"^#{1,6}\s+", "", content, flags=re.MULTILINE)
    content = re.sub(r"^[*-]\s+", "", content, flags=re.MULTILINE)
    content = content.replace(chr(96), "").replace("**", "").replace("__", "")
    return strip_html(content)


def split_text(text, max_chars=900):
    """Split text into complete, reasonably-sized retrieval chunks."""
    if len(text) <= max_chars:
        return [text]

    sentences = re.split(r"(?<=[.!?])\s+", text)
    chunks = []
    current = ""
    for sentence in sentences:
        if current and len(current) + len(sentence) + 1 > max_chars:
            chunks.append(current.strip())
            current = sentence
        else:
            current = f"{current} {sentence}".strip()
    if current:
        chunks.append(current.strip())
    return chunks


def parse_now(now_yml):
    """Extract the public Live text without needing a YAML dependency."""
    updated_match = re.search(r'^updated:\s*["\']?([^"\'\n]+)', now_yml, flags=re.MULTILINE)
    content_match = re.search(
        r"^content:\s*\|-?\s*\n(.*?)(?=^projects:|\Z)",
        now_yml,
        flags=re.MULTILINE | re.DOTALL,
    )
    updated = updated_match.group(1).strip() if updated_match else "recently"
    content = content_match.group(1) if content_match else now_yml
    content = re.sub(r"^\s{2}", "", content, flags=re.MULTILINE)
    project_lines = re.findall(r'^\s+description:\s*["\']([^"\']+)["\']', now_yml, flags=re.MULTILINE)
    return updated, clean_markdown(content), project_lines


def extract_chunks():
    """Extract text chunks from all site content."""
    chunks = []

    # --- Profile from index.html ---
    index_html = read_file("index.html")
    if index_html:
        body = strip_html(index_html)
        # Remove YAML front matter
        body = re.sub(r"^---.*?---", "", body, flags=re.DOTALL).strip()

        chunks.append({
            "id": "profile-about",
            "source": "index.html",
            "title": "About Muhammad Ibrahim Khan",
            "kind": "profile",
            "priority": 8,
            "questions": [
                "Who is Ibrahim?",
                "What is Ibrahim's research topic?",
                "What is my PhD about?",
            ],
            "keywords": ["research topic", "PhD topic", "MCTS", "predictive control"],
            "text": (
                "Muhammad Ibrahim Khan is a PhD researcher at Coventry University "
                "working on Monte Carlo Tree Search (MCTS) for predictive control "
                "of energy systems. His research develops tree-search methods that "
                "let controllers plan ahead under uncertainty, using MCTS as a "
                "model-predictive controller for heating systems. He previously "
                "worked as an Associate AI Engineer at CureMD, building LLM-powered "
                "code assistants, RAG chatbots, and automated code grading systems."
            ),
        })

        chunks.append({
            "id": "profile-education",
            "source": "index.html",
            "title": "Education",
            "kind": "profile",
            "priority": 10,
            "questions": [
                "When will Ibrahim graduate?",
                "When will I graduate?",
                "When does Ibrahim expect to finish his PhD?",
            ],
            "keywords": ["graduation", "PhD completion", "March 2028", "thesis topic"],
            "text": (
                "PhD in Reinforcement Learning at Coventry University, UK. "
                "Thesis: Predictive Control Through Monte Carlo Tree Search. "
                "Expected completion March 2028. "
                "BEng in Mechanical Engineering from the National University of "
                "Sciences and Technology (NUST), Pakistan (2019-2023). "
                "Final-year project: Autonomous Weeding Robot."
            ),
        })

        chunks.append({
            "id": "profile-experience",
            "source": "index.html",
            "title": "Work Experience",
            "kind": "profile",
            "text": (
                "Teaching Assistant and Lab Demonstrator at Coventry University "
                "(Aug 2025 - Jan 2026): Ran weekly labs for 30+ MSc Data Science "
                "students covering deep learning and computer vision. Marked 200+ "
                "assignments per semester. "
                "Associate AI Engineer at CureMD (Jul 2023 - Sep 2024): Built an "
                "in-house LLM code assistant (Mixtral 8x7B + RAG) that cut code-review "
                "turnaround by 25% across 150+ developers. Shipped RAG chatbots handling "
                "500+ daily support queries with 92% resolution accuracy. Automated "
                "candidate screening with Llama 3."
            ),
        })

        chunks.append({
            "id": "profile-skills",
            "source": "index.html",
            "title": "Technical Skills",
            "kind": "profile",
            "text": (
                "Languages: Python (primary), C++, MATLAB. "
                "RL and Control: Stable Baselines3, RLLib, Gymnasium, MuJoCo. "
                "ML and Deep Learning: PyTorch, TensorFlow, Scikit-learn, Hugging Face Transformers. "
                "LLMs and NLP: LangChain, RAG pipelines, LoRA fine-tuning. "
                "Infrastructure: Git, Docker, Linux, Weights and Biases."
            ),
        })

        chunks.append({
            "id": "profile-awards",
            "source": "index.html",
            "title": "Awards",
            "kind": "profile",
            "text": (
                "Fully Funded PhD Scholarship from Coventry University (Sep 2024). "
                "Second Runner-Up at the Prime Minister's National Innovation Award 2023, "
                "Government of Pakistan, for the Autonomous Weeding Robot project, "
                "selected from over 40,000 entries nationwide."
            ),
        })

        chunks.append({
            "id": "profile-contact",
            "source": "index.html",
            "title": "Contact Information",
            "kind": "profile",
            "priority": 6,
            "text": (
                "Email: khanm442@uni.coventry.ac.uk. "
                "LinkedIn: linkedin.com/in/ibrahimkhanlive1000. "
                "GitHub: github.com/Ibrahimkhan4real. "
                "Website: ibrahimkhan4real.github.io."
            ),
        })

    # --- Papers from site_data/papers.json ---
    papers_json = read_file("site_data/papers.json")
    if papers_json:
        data = json.loads(papers_json)
        pubs = data.get("publications", data.get("papers", []))
        for i, paper in enumerate(pubs):
            title = paper.get("title", "Untitled")
            authors = paper.get("authors", "")
            venue = paper.get("venue", "")
            year = paper.get("year", "")
            link = paper.get("link", "")
            citations = paper.get("citations")

            text = f"Paper: {title}. Authors: {authors}."
            if venue:
                text += f" Published in: {venue}."
            if year:
                text += f" Year: {year}."
            if citations:
                text += f" Citations: {citations}."
            if link:
                text += f" Link: {link}."

            chunks.append({
                "id": f"paper-{i}",
                "source": "site_data/papers.json",
                "title": title,
                "text": text,
                "kind": "paper",
                "date": str(year),
            })

    # --- Blog posts ---
    blog_posts_json = read_file("blog/posts/posts.json")
    if blog_posts_json:
        posts = json.loads(blog_posts_json)
        for post in posts:
            md_file = post.get("file", "")
            md_content = read_file(f"blog/posts/{md_file}")
            if md_content:
                # Strip markdown formatting lightly
                clean = re.sub(r"#+ ", "", md_content)
                clean = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", clean)
                clean = re.sub(r"\s+", " ", clean).strip()

                # Split long posts into ~500 char chunks
                if len(clean) > 600:
                    sentences = re.split(r"(?<=[.!?])\s+", clean)
                    current_chunk = ""
                    chunk_idx = 0
                    for sent in sentences:
                        if len(current_chunk) + len(sent) > 500 and current_chunk:
                            chunks.append({
                                "id": f"blog-{post.get('slug', md_file)}-{chunk_idx}",
                                "source": f"blog/posts/{md_file}",
                                "title": post.get("title", md_file),
                                "text": current_chunk.strip(),
                                "kind": "blog",
                                "date": post.get("date", ""),
                            })
                            chunk_idx += 1
                            current_chunk = sent
                        else:
                            current_chunk += " " + sent
                    if current_chunk.strip():
                        chunks.append({
                            "id": f"blog-{post.get('slug', md_file)}-{chunk_idx}",
                            "source": f"blog/posts/{md_file}",
                            "title": post.get("title", md_file),
                            "text": current_chunk.strip(),
                            "kind": "blog",
                            "date": post.get("date", ""),
                        })
                else:
                    chunks.append({
                        "id": f"blog-{post.get('slug', md_file)}",
                        "source": f"blog/posts/{md_file}",
                        "title": post.get("title", md_file),
                        "text": clean,
                        "kind": "blog",
                        "date": post.get("date", ""),
                    })

    # --- Jekyll posts ---
    posts_dir = os.path.join(ROOT, "_posts")
    if os.path.isdir(posts_dir):
        for fname in sorted(os.listdir(posts_dir)):
            if fname.endswith(".md"):
                content = read_file(f"_posts/{fname}")
                if content:
                    metadata, body = parse_front_matter(content)
                    clean = clean_markdown(body)
                    if len(clean) > 50:
                        post_slug = fname[:-3]
                        title = metadata.get(
                            "title",
                            re.sub(r"^\d{4}-\d{2}-\d{2}-", "", post_slug).replace("-", " ").title(),
                        )
                        post_date = fname[:10] if re.match(r"^\d{4}-\d{2}-\d{2}", fname) else ""
                        for chunk_index, text in enumerate(split_text(clean)):
                            chunks.append({
                                "id": f"jekyll-post-{post_slug}-{chunk_index}",
                                "source": f"_posts/{fname}",
                                "title": title,
                                "text": text,
                                "kind": "blog",
                                "date": post_date,
                                "priority": 3 if chunk_index == 0 else 0,
                            })

    # --- Current status from _data/now.yml ---
    now_yml = read_file("_data/now.yml")
    if now_yml:
        updated, current_focus, project_lines = parse_now(now_yml)
        project_text = " ".join(project_lines)
        chunks.append({
            "id": "current-status",
            "source": "_data/now.yml",
            "title": "Current Status",
            "text": f"Last updated: {updated}. Current focus: {current_focus} {project_text}".strip(),
            "kind": "live",
            "date": updated,
            "priority": 10,
            "questions": [
                "What are you working on now?",
                "What is Ibrahim doing right now?",
                "What is on the Live page?",
            ],
            "keywords": ["current work", "current research", "live update", "right now"],
        })

    return chunks


def get_embedding(text, title):
    """Call Gemini embedding API for a single text."""
    payload = json.dumps({
        "model": EMBED_MODEL,
        "content": {"parts": [{"text": text}]},
        "embedContentConfig": {
            "taskType": "RETRIEVAL_DOCUMENT",
            "title": title,
        },
    }).encode("utf-8")

    req = urllib.request.Request(
        EMBED_URL,
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    try:
        with urllib.request.urlopen(req) as resp:
            result = json.loads(resp.read().decode("utf-8"))
            return result["embedding"]["values"]
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8") if e.fp else ""
        print(f"  ERROR embedding text: {e.code} {body[:200]}", file=sys.stderr)
        return None


def validate_chunks(chunks):
    """Check that essential profile, Blog and Live coverage is present."""
    ids = [chunk["id"] for chunk in chunks]
    errors = []
    if len(ids) != len(set(ids)):
        errors.append("Chunk IDs are not unique.")
    for required_id in ("profile-about", "profile-education", "current-status"):
        if required_id not in ids:
            errors.append(f"Missing required chunk: {required_id}")
    if not any(chunk.get("kind") == "blog" for chunk in chunks):
        errors.append("No blog chunks were extracted.")
    if not any("March 2028" in chunk["text"] for chunk in chunks):
        errors.append("Expected PhD completion date is missing.")
    if not any("Predictive Control Through Monte Carlo Tree Search" in chunk["text"] for chunk in chunks):
        errors.append("PhD research topic is missing.")
    return errors


def main():
    parser = argparse.ArgumentParser(description="Build or validate the website RAG index.")
    parser.add_argument(
        "--check",
        action="store_true",
        help="Extract and validate content without calling Gemini or writing the index.",
    )
    args = parser.parse_args()

    print("Extracting content chunks...")
    chunks = extract_chunks()
    print(f"  Found {len(chunks)} chunks")

    errors = validate_chunks(chunks)
    if errors:
        for error in errors:
            print(f"ERROR: {error}", file=sys.stderr)
        sys.exit(1)

    if args.check:
        counts = {}
        for chunk in chunks:
            kind = chunk.get("kind", "other")
            counts[kind] = counts.get(kind, 0) + 1
        print("  Coverage:", ", ".join(f"{kind}={count}" for kind, count in sorted(counts.items())))
        print("  Required profile, PhD, Blog and Live facts are present.")
        return

    if not GEMINI_API_KEY:
        print("ERROR: Set GEMINI_API_KEY environment variable.", file=sys.stderr)
        print("  export GEMINI_API_KEY='your-key-here'", file=sys.stderr)
        sys.exit(1)

    print("Generating embeddings via Gemini...")
    index_entries = []
    for i, chunk in enumerate(chunks):
        label = chunk["title"][:50]
        print(f"  [{i + 1}/{len(chunks)}] {label}...")
        embedding = get_embedding(chunk["text"], chunk["title"])
        if embedding:
            index_entries.append({**chunk, "embedding": embedding})
        else:
            print(f"    Skipped (embedding failed)")

    output_path = os.path.join(ROOT, "worker", "src", "rag_index.json")
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump({
            "chunks": index_entries,
            "model": EMBED_MODEL,
            "taskType": "RETRIEVAL_DOCUMENT",
        }, f)

    print(f"\nDone! Wrote {len(index_entries)} entries to {output_path}")
    print(f"  Index size: {os.path.getsize(output_path) / 1024:.1f} KB")


if __name__ == "__main__":
    main()
