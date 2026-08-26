#!/usr/bin/env bash
set -euo pipefail

site_smoke_container="ibrahim-site-smoke-$$"
site_ready=0

cleanup_site_smoke() {
  docker --context default stop "${site_smoke_container}" >/dev/null 2>&1 || true
}
trap cleanup_site_smoke EXIT

docker --context default run --detach --rm \
  --name "${site_smoke_container}" \
  --user "$(id -u):$(id -g)" \
  --publish 4000:4000 \
  --volume "$(pwd):/site" \
  ibrahim-site-jekyll:232 >/dev/null

for site_attempt in $(seq 1 60); do
  if curl --fail --silent --show-error http://127.0.0.1:4000/ >/dev/null; then
    site_ready=1
    break
  fi
  sleep 1
done

if [[ "${site_ready}" -ne 1 ]]; then
  docker --context default logs "${site_smoke_container}"
  exit 1
fi

SITE_BASE_URL=http://127.0.0.1:4000 npm run test:smoke
