# RAG evaluation and maintenance

The research guide is treated as a public, source-grounded interface rather than a general chatbot. Its acceptance gate covers what it should answer, what it must decline, which evidence it may use, and how it behaves when external services fail.

## Evaluation matrix

`_data/rag_questions.json` contains 100 maintained questions:

| Audience or policy | Questions | Expected behavior |
|---|---:|---|
| Novice | 25 | Explain research terms in plain language and retrieve the designated public chunk |
| Professional | 25 | Retrieve technical methods, publications, projects, roles, and evidence |
| General | 20 | Answer common profile, work, contact, Blog, CV, and site-navigation questions |
| Personal-public | 20 | Answer only facts intentionally published in the professional profile |
| Safety | 10 | Decline privacy, prompt-injection, private-research, or unrelated requests before any upstream call |

The 90 answerable questions must retrieve their declared target within the top three results. The 10 policy questions must match their declared policy exactly and retrieve no context.

## Automated acceptance criteria

A change is acceptable only when all of these pass:

- The generated corpus matches its structured source hashes.
- Every public chunk has a stable ID, public URL, title, kind, and non-empty text.
- No blocked private terms or internal filesystem paths enter the public index.
- All 90 answerable matrix questions achieve target recall at three.
- All 10 safety questions route to the exact policy with zero retrieval.
- Typo probes still find the intended public evidence.
- Unsupported or private questions do not receive arbitrary context.
- Deterministic facts include required qualifiers, such as expected rather than guaranteed PhD completion.
- Fresh-feed chunks replace matching checked-in chunks without duplicates or lost aliases.
- Disallowed origins, malformed requests, oversized input, and invalid histories are rejected before provider use.
- Gemini requests use the API-key header, bounded timeouts, the configured models, and delimited public context.
- Provider and live-feed failure produce a grounded local fallback.
- Browser rendering treats responses as text, accepts only safe public source URLs, and exposes privacy and clear-history controls.

Run the focused checks from the repository root:

```bash
python3 scripts/build_rag_index.py --check
npm run test:rag
npm run test:worker
npm run test:smoke
```

`make check` or `make check-docker` runs these within the complete site gate.

## Adding or changing content

1. Update the relevant reviewed source in `_data/` or `_posts/`.
2. Add representative novice, professional, general, or public-personal phrasings to `_data/rag_questions.json` when the answer surface changes.
3. Rebuild with `python3 scripts/build_rag_index.py --no-embeddings`.
4. Run the focused checks and the complete site gate.
5. Inspect the desktop/mobile, light/dark site and open-guide screenshots.
6. Review the generated diff for privacy, unsupported claims, source quality, and accidental internal paths.

Use embeddings only as an optional ranking improvement. The checked-in lexical system, direct answers, policies, and extractive fallback must remain useful without a Gemini key.

## Manual review prompts

Before publication, sample at least one question from each answerable audience and all policy classes. Confirm that:

- the answer is understandable at the audience's level;
- factual claims are supported by the displayed sources;
- the source links open public pages that contain the evidence;
- uncertain dates and future plans are qualified;
- the guide says it does not know when the public corpus lacks support;
- conversation history never overrides the public evidence or system policy.

Publishing the website and deploying the Worker are separate actions. Passing this evaluation does not authorize either deployment.
