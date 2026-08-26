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
```

`make setup` installs the locked Ruby gems, root browser-test packages, Worker
packages, and Playwright's Chromium build. It does not install system packages
or modify website content.

## Common commands

```bash
make build          # strict Jekyll build into _site/
make serve          # local site at http://127.0.0.1:4000
make test           # JavaScript syntax and Worker unit tests
make smoke          # start Jekyll and test all primary routes in Chromium
make screenshots    # desktop/mobile, light/dark screenshots
make worker-dry-run # validate the Worker deployment bundle
make check          # complete local validation gate
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

The smoke suite uses a locked local browser rather than a signed-in or in-app
browser session. It covers Home, Live, Papers, Blog, Demos, and Travel at
desktop and mobile widths in light and dark themes. Add route-specific content
assertions alongside each feature rather than weakening the structural checks.

## Dependency updates

Update one dependency family at a time and commit its lockfile:

```bash
bundle update github-pages webrick
npm install --save-dev --save-exact @playwright/test@VERSION
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
