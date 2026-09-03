# Grounded Research Guide Worker

This Cloudflare Worker powers the site's "Ask about my research" guide. It answers from verified public website content, exposes inspectable source links, and declines questions that are private, unrelated, or about unpublished research.

## Request flow

1. Validate the origin, method, content type, body size, query, and short conversation history.
2. Route privacy, prompt-injection, private-research, and unrelated requests to deterministic policies before any upstream call.
3. Answer stable facts such as contact details, current roles, CV, latest Blog post, and publication counts deterministically.
4. Merge the checked-in corpus with the current public `rag-feed.json`, then use evaluated aliases and weighted lexical retrieval.
5. Use semantic retrieval only when every corpus chunk has a compatible embedding.
6. If a Gemini key is configured, generate a source-constrained answer with `models/gemini-3.5-flash-lite`; otherwise return the grounded extractive answer.
7. Return only public HTTPS source links. Provider and feed failures fall back to the checked-in corpus.

The browser never receives the Gemini key. The key is sent to Google in the `x-goog-api-key` header, not in a URL.

## Public content contract

The indexer reads only these reviewed sources:

- `_data/profile.yml`: biography, public contact, roles, education, skills, service, and recognition
- `_data/now.yml`: current public workstreams
- `_data/projects.yml`: verified public software projects
- `_data/papers.json`: validated publication snapshot
- `_data/rag.yml`: novice explainers and public resources
- `_posts/`: published research notes
- `_data/rag_questions.json`: 100-question retrieval and policy evaluation matrix

It does not parse the raw CV or arbitrary repository files. Keep private details, references, confidential work, and anonymous-review material out of all public structured data.

## Build and validate the corpus

From the repository root, build the deterministic lexical corpus without an API key:

```bash
python3 scripts/build_rag_index.py --no-embeddings
```

Verify that the committed index is current and that every evaluated question is covered:

```bash
python3 scripts/build_rag_index.py --check
npm run test:rag
```

To build an optional all-or-nothing semantic index:

```bash
export GEMINI_API_KEY="your-key"
python3 scripts/build_rag_index.py
```

The embedding build uses `models/gemini-embedding-001` with the `RETRIEVAL_DOCUMENT` task type. A query uses `QUESTION_ANSWERING`. If any embedding fails or has the wrong dimension, the index is not partially overwritten.

## Test locally

```bash
npm --prefix worker ci
npm --prefix worker test
npm --prefix worker run deploy:dry-run
```

The test suite covers the complete question matrix, typo-tolerant retrieval, deterministic facts, privacy and injection policies, unsupported questions, feed replacement, request limits, exact CORS behavior, safe provider headers, provider failure, and the optional rate-limiter binding.

For a local HTTP session:

```bash
cd worker
npx wrangler dev
curl -X POST http://localhost:8787 \
  -H "Content-Type: application/json" \
  -d '{"query":"What is Ibrahim researching?","history":[]}'
```

## API shape

Successful responses use this stable structure:

```json
{
  "answer": "...",
  "mode": "direct",
  "sources": [
    {"id":"profile-overview","title":"About Ibrahim","url":"https://...","kind":"profile","date":""}
  ],
  "freshness": {},
  "meta": {
    "corpusVersion": "...",
    "retrieval": "lexical",
    "provider": "none",
    "fresh": true
  }
}
```

`mode` distinguishes direct, RAG, extractive, decline, and unsupported responses. Sources never contain internal paths, similarity scores, or non-public URLs.

## Configuration

`worker/wrangler.toml` contains non-secret defaults:

- `ALLOWED_ORIGIN`: exact production origin. `ALLOWED_ORIGINS` may supply a comma-separated exact allowlist.
- `RAG_FEED_URL`: public Jekyll feed used for fresh content.
- `SITE_ORIGIN`: optional public source-link origin override.
- `RATE_LIMITER`: optional Cloudflare rate-limiter binding; requests remain functional when it is absent.

Set the secret separately:

```bash
cd worker
npx wrangler secret put GEMINI_API_KEY
```

The frontend endpoint is configured once as `chat_api` in `_config.yml`.

## Deployment

Validation deliberately does not deploy. After reviewing the corpus, tests, and screenshots, deployment is a separate authorized action:

```bash
cd worker
npx wrangler deploy
```

Model names should be checked against the official [Gemini models](https://ai.google.dev/gemini-api/docs/models) and [embeddings](https://ai.google.dev/gemini-api/docs/embeddings) documentation before a future upgrade.

See [`RAG_EVALUATION.md`](../RAG_EVALUATION.md) for the maintained acceptance criteria and question coverage.
