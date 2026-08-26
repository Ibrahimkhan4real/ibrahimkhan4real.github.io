# Ibrahim Khan — research website

Source for [ibrahimkhan4real.github.io](https://ibrahimkhan4real.github.io),
a Jekyll site covering Muhammad Ibrahim Khan's research, publications, public
software, teaching and professional experience. The repository also contains
the retrieval corpus and Cloudflare Worker used by the site's research guide.

## Content sources

- `_data/profile.yml` is the verified public profile and biography.
- `_data/now.yml` supplies the current-work summary.
- `site_data/papers.json` is the checked-in publication snapshot rendered by
  the site.
- `_posts/` contains public research notes.
- `rag-feed.json` and the Worker index are generated public retrieval data.
- `assets/docs/Ibrahim_CV.pdf` is the downloadable CV.

Keep private contact details, references, employer-confidential material and
anonymous-review information out of structured site data and retrieval sources.

## Local development

The reproducible setup is documented in [DEVELOPMENT.md](DEVELOPMENT.md).
The no-sudo Docker path is the most portable:

```bash
make build-docker
make smoke-docker
make screenshots-docker
```

A host Ruby/Node setup can run the complete gate with:

```bash
make setup
make check
```

The site pins the GitHub Pages dependency bundle, Node/npm versions,
Playwright, Worker packages and Wrangler. CI repeats the strict build, syntax,
Worker and browser checks.

## Primary routes

- Home: profile and biography
- Work: roles, research practice, public projects and teaching
- Live: current research focus
- Papers: server-rendered publication record
- Blog: research notes
- Demos: interactive reinforcement-learning examples

## Updating public facts

1. Update the appropriate structured source rather than duplicating facts in a
   template.
2. Keep dates and claims within what the public CV, publication record or
   linked public repository supports.
3. Run the full local acceptance gate.
4. Inspect desktop/mobile and light/dark screenshots in
   `artifacts/screenshots/`.
5. Commit the source and any required generated public data together.

Production publication is separate from local validation. Do not deploy the
GitHub Pages site or Worker merely because the local gate passes.
