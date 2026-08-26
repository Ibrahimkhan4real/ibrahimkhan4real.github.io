.PHONY: setup build serve test smoke screenshots worker-dry-run check clean \
	jekyll-image build-docker serve-docker smoke-docker screenshots-docker check-docker

setup:
	bundle install
	npm ci
	npm --prefix worker ci
	npx playwright install chromium

build:
	bundle exec jekyll build --strict_front_matter

serve:
	bundle exec jekyll serve --host 127.0.0.1 --port 4000 --livereload

test:
	npm run test:syntax
	npm run test:content
	npm run test:worker

smoke:
	npm run test:smoke

screenshots:
	npm run screenshots

worker-dry-run:
	npm run worker:dry-run

check: build test smoke worker-dry-run

jekyll-image:
	docker --context default build -f Dockerfile.jekyll -t ibrahim-site-jekyll:232 .

build-docker: jekyll-image
	docker --context default run --rm --user "$$(id -u):$$(id -g)" -v "$$(pwd):/site" ibrahim-site-jekyll:232 bundle exec jekyll build --strict_front_matter

serve-docker: jekyll-image
	docker --context default run --rm --user "$$(id -u):$$(id -g)" -p 4000:4000 -v "$$(pwd):/site" ibrahim-site-jekyll:232

smoke-docker: jekyll-image
	scripts/run-smoke-docker.sh

screenshots-docker: jekyll-image
	SITE_CAPTURE_SCREENSHOTS=1 scripts/run-smoke-docker.sh

check-docker: build-docker test smoke-docker worker-dry-run

clean:
	bundle exec jekyll clean
