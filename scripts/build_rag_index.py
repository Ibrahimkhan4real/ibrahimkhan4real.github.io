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

import json
import os
import re
import sys
import urllib.request
import urllib.error

GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")
EMBED_MODEL = "models/text-embedding-004"
EMBED_URL = f"https://generativelanguage.googleapis.com/v1beta/{EMBED_MODEL}:embedContent?key={GEMINI_API_KEY}"

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def strip_html(text):
    """Remove HTML tags and collapse whitespace."""
    text = re.sub(r"<[^>]+>", " ", text)
    text = re.sub(r"&[a-zA-Z]+;", " ", text)
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def read_file(rel_path):
    path = os.path.join(ROOT, rel_path)
    if not os.path.exists(path):
        return None
    with open(path, "r", encoding="utf-8") as f:
        return f.read()


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
            "text": (
                "Email: ibrahimkhanlive1000@gmail.com. "
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
                        })
                else:
                    chunks.append({
                        "id": f"blog-{post.get('slug', md_file)}",
                        "source": f"blog/posts/{md_file}",
                        "title": post.get("title", md_file),
                        "text": clean,
                    })

    # --- Jekyll posts ---
    posts_dir = os.path.join(ROOT, "_posts")
    if os.path.isdir(posts_dir):
        for fname in sorted(os.listdir(posts_dir)):
            if fname.endswith(".md"):
                content = read_file(f"_posts/{fname}")
                if content:
                    # Remove front matter
                    content = re.sub(r"^---.*?---", "", content, flags=re.DOTALL).strip()
                    clean = re.sub(r"#+ ", "", content)
                    clean = re.sub(r"\s+", " ", clean).strip()
                    if len(clean) > 50:
                        chunks.append({
                            "id": f"jekyll-post-{fname}",
                            "source": f"_posts/{fname}",
                            "title": fname.replace(".md", "").replace("-", " "),
                            "text": clean[:800],
                        })

    # --- Current status from _data/now.yml ---
    now_yml = read_file("_data/now.yml")
    if now_yml:
        chunks.append({
            "id": "current-status",
            "source": "_data/now.yml",
            "title": "Current Status",
            "text": now_yml.replace("updated:", "Last updated:").replace("content:", "Current focus:"),
        })

    return chunks


def get_embedding(text):
    """Call Gemini embedding API for a single text."""
    payload = json.dumps({
        "model": EMBED_MODEL,
        "content": {"parts": [{"text": text}]},
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


def main():
    if not GEMINI_API_KEY:
        print("ERROR: Set GEMINI_API_KEY environment variable.", file=sys.stderr)
        print("  export GEMINI_API_KEY='your-key-here'", file=sys.stderr)
        sys.exit(1)

    print("Extracting content chunks...")
    chunks = extract_chunks()
    print(f"  Found {len(chunks)} chunks")

    print("Generating embeddings via Gemini...")
    index_entries = []
    for i, chunk in enumerate(chunks):
        label = chunk["title"][:50]
        print(f"  [{i + 1}/{len(chunks)}] {label}...")
        embedding = get_embedding(chunk["text"])
        if embedding:
            index_entries.append({
                "id": chunk["id"],
                "title": chunk["title"],
                "text": chunk["text"],
                "source": chunk["source"],
                "embedding": embedding,
            })
        else:
            print(f"    Skipped (embedding failed)")

    output_path = os.path.join(ROOT, "worker", "src", "rag_index.json")
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump({"chunks": index_entries, "model": EMBED_MODEL}, f)

    print(f"\nDone! Wrote {len(index_entries)} entries to {output_path}")
    print(f"  Index size: {os.path.getsize(output_path) / 1024:.1f} KB")


if __name__ == "__main__":
    main()
