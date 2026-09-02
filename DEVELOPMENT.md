# Local development

The site uses the same Jekyll dependency bundle as GitHub Pages, a locked
Worker dependency tree, and a locked Playwright browser-test dependency. This
keeps local builds and CI on the same toolchain.

## Prerequisites

- Ruby 3.2.3 (see `.ruby-version`)
- Bundler 2.5.23
- Node.js 24.11.1 and npm 11.6.2 (see `.nvmrc` and `package.json`)
- Python 3 for the existing content-index scripts
- Docker is the no-sudo Jekyll fallback when local Ruby headers are unavailable.
  The default Docker context must point to a running Docker Engine.

Install Bundler in your user gem directory if it is not already available:

```bash
gem install --user-install bundler -v 2.5.23
```

Ensure the `bin` directory printed by `gem env user_gemhome` is on `PATH`.

## First-time setup

```bash
nvm use
make setup
python3 -m pip install --user -r requirements-content.txt
```

`make setup` installs the locked Ruby gems, root browser-test packages, Worker
packages, and Playwright's Chromium build. It does not install system packages
or modify website content.

## Common commands

```bash
make build          # strict Jekyll build into _site/
make serve          # local site at http://127.0.0.1:4000
make test           # JavaScript, content updater, and Worker unit tests
make links          # built-site internal targets, fragments, email and HTTPS
make links-external # additionally request every external HTTPS destination
make smoke          # test all primary routes in Chromium
make screenshots    # desktop/mobile, light/dark screenshots
make worker-dry-run # validate the Worker deployment bundle
make check          # complete local validation gate, including live links
make clean          # remove Jekyll build output
```

If the host cannot compile Ruby gems, use the pinned container instead:

```bash
make build-docker       # build the image and render _site/
make serve-docker       # serve at http://127.0.0.1:4000
make smoke-docker       # responsive browser smoke suite
make screenshots-docker # capture the full screenshot matrix
make check-docker       # complete no-sudo local gate
```

The image is based on `ruby:3.2.3-bookworm`, installs Bundler 2.5.23, and
uses the committed Gemfile lock. It does not depend on the host Ruby setup.

Screenshots are written to `artifacts/screenshots/` and are intentionally
ignored by Git. Playwright traces and failure screenshots are written beneath
`artifacts/playwright/`.

The smoke suite first performs a production-URL Jekyll build and then serves
the finished `_site/` directory from a random loopback port. This preserves
canonical and social URLs during local checks and avoids test-port collisions.
It uses a locked local Chromium build rather than a signed-in or in-app browser
session. It covers Home, Live, Work, Demos, Papers, Blog, and the custom 404 at
desktop and mobile widths in light and dark themes. The suite also checks
keyboard alternatives for canvas demos, page metadata, discovery files, and
serious or critical automated WCAG A/AA findings with axe-core.

The internal link gate runs in the main CI workflow. A separate scheduled
workflow requests all external HTTPS links each Tuesday; access-restricted
responses from sites such as LinkedIn are warnings, while missing or broken
destinations fail the job. Add route-specific assertions alongside each
feature rather than weakening these checks.

## Dependency updates

Update one dependency family at a time and commit its lockfile:

```bash
bundle update github-pages webrick
npm install --save-dev --save-exact @playwright/test@VERSION
npm install --save-dev --save-exact @axe-core/playwright@VERSION
npm --prefix worker install --save-dev --save-exact wrangler@VERSION
make check
```

Commit `Gemfile.lock`, the root `package-lock.json`, and
`worker/package-lock.json`. CI uses `bundle install` through `ruby/setup-ruby`
and `npm ci`, so uncommitted dependency drift fails early.

## Worker development

The Worker remains a separate Node package because Cloudflare deploys from the
`worker/` directory:

```bash
npm --prefix worker test
npm --prefix worker run dev
npm --prefix worker run deploy:dry-run
```

Production deployment and secrets are deliberately not part of `make check`.

## Publication snapshot

The Papers page never fetches Google Scholar in a visitor's browser. Its
server-rendered data lives in `_data/papers.json`. To attempt a local refresh:

```bash
python3 scripts/update_papers.py --scholar-id bh9os08AAAAJ
```

The updater rejects empty, duplicated, malformed, or unexpectedly shrunken
results and replaces the file atomically. The scheduled workflow adds
`--allow-stale`, because Scholar frequently returns HTTP 403 to hosted runners;
in that case the validated last-known-good snapshot remains in place and the
job summary records a warning. A large intentional reduction requires a manual
run with `--allow-shrink` after checking the Scholar profile directly.
