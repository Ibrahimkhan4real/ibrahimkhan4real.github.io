#!/usr/bin/env bash
set -euo pipefail

site_smoke_container="ibrahim-site-smoke-$$"
site_ready=0

cleanup_site_smoke() {
  docker --context default stop "${site_smoke_container}" >/dev/null 2>&1 || true
}
trap cleanup_site_smoke EXIT

docker --context default run --rm \
  --user "$(id -u):$(id -g)" \
  --volume "$(pwd):/site" \
  ibrahim-site-jekyll:232 \
  bundle exec jekyll build --strict_front_matter >/dev/null

docker --context default run --detach --rm \
  --name "${site_smoke_container}" \
  --user "$(id -u):$(id -g)" \
  --publish 127.0.0.1::4000 \
  --volume "$(pwd):/site" \
  ibrahim-site-jekyll:232 \
  bundle exec ruby -run -e httpd _site -p 4000 -b 0.0.0.0 >/dev/null

site_smoke_binding="$(docker --context default port "${site_smoke_container}" 4000/tcp)"
site_smoke_port="${site_smoke_binding##*:}"
site_smoke_url="http://127.0.0.1:${site_smoke_port}"

for site_attempt in $(seq 1 60); do
  if curl --fail --silent --show-error "${site_smoke_url}/" >/dev/null; then
    site_ready=1
    break
  fi
  sleep 1
done

if [[ "${site_ready}" -ne 1 ]]; then
  docker --context default logs "${site_smoke_container}"
  exit 1
fi

SITE_BASE_URL="${site_smoke_url}" npm run test:smoke
