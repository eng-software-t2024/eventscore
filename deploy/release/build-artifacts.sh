#!/usr/bin/env bash
set -euo pipefail

BACKEND_SHA=bcde18e06a499a7171fd50d30a3eca9c9673aed8
FRONTEND_SHA=154a670195e1645358fc16a01c3277e84b72768f
ROOT=$(git rev-parse --show-toplevel)
OUT=${1:-/tmp/eventscore-release-bcde18e-154a670}
REUSE_API_FROM=${2:-}
API_TAG=localhost/eventscore-api:bcde18e-20261121
WEB_TAG=localhost/eventscore-web:154a670
API_ARCHIVE=eventscore-api-bcde18e.tar
WEB_ARCHIVE=eventscore-web-154a670.tar
API_REUSED=0

git -C "$ROOT" cat-file -e "$BACKEND_SHA^{commit}"
git -C "$ROOT" cat-file -e "$FRONTEND_SHA^{commit}"
mkdir -p "$OUT"
for artifact in "$API_ARCHIVE" "$WEB_ARCHIVE" \
  compose.api.override.yaml compose.api.rollback.yaml compose.web.yaml \
  image-identities.txt SHA256SUMS; do
  if [[ -e "$OUT/$artifact" ]]; then
    printf 'Refusing to overwrite existing artifact: %s\n' "$OUT/$artifact" >&2
    exit 1
  fi
done
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
mkdir -p "$TMP/web"

git -C "$ROOT" archive "$FRONTEND_SHA" | tar -x -C "$TMP/web"

mkdir -p "$TMP/web/deploy/release"
cp "$ROOT"/deploy/release/Containerfile.web "$TMP/web/deploy/release/"
cp "$ROOT"/deploy/release/nginx.conf "$TMP/web/deploy/release/"
cat > "$TMP/web/.dockerignore" <<'EOF'
.git
.git/**
web/node_modules
web/dist
.env
.env.*
EOF

if [[ -n "$REUSE_API_FROM" ]]; then
  (
    cd "$REUSE_API_FROM"
    sha256sum -c SHA256SUMS
  )
  test -f "$REUSE_API_FROM/$API_ARCHIVE"
  cp "$REUSE_API_FROM/$API_ARCHIVE" "$OUT/$API_ARCHIVE"
  podman load -i "$OUT/$API_ARCHIVE" >/dev/null
  API_REUSED=1
else
  mkdir -p "$TMP/api/deploy/release"
  git -C "$ROOT" archive "$BACKEND_SHA" | tar -x -C "$TMP/api"
  cp "$ROOT"/deploy/release/Containerfile.api "$TMP/api/deploy/release/"
  cp "$ROOT"/deploy/release/debian.sources "$TMP/api/deploy/release/"
  cat > "$TMP/api/.dockerignore" <<'EOF'
.git
.git/**
node_modules
web
dist
coverage
audit-reports
.env
.env.*
!.env.example
src/generated/prisma
*.tar
*.tar.gz
*.dump
*.log
EOF
  podman build --format docker --platform linux/amd64 \
    --build-arg "VCS_REF=$BACKEND_SHA" \
    -f "$TMP/api/deploy/release/Containerfile.api" \
    -t "$API_TAG" "$TMP/api"
  podman save --format docker-archive -o "$OUT/$API_ARCHIVE" "$API_TAG"
fi
podman build --format docker --platform linux/amd64 \
  --build-arg "VCS_REF=$FRONTEND_SHA" \
  -f "$TMP/web/deploy/release/Containerfile.web" \
  -t "$WEB_TAG" "$TMP/web"

podman save --format docker-archive -o "$OUT/$WEB_ARCHIVE" "$WEB_TAG"
cp "$ROOT"/deploy/release/compose.api.override.yaml "$OUT/"
cp "$ROOT"/deploy/release/compose.api.rollback.yaml "$OUT/"
cp "$ROOT"/deploy/release/compose.web.yaml "$OUT/"
if [[ "$API_REUSED" == 1 ]]; then
  API_IDENTITY=$(awk -v sha="$BACKEND_SHA" '$NF == sha { print; count++ } END { if (count != 1) exit 1 }' "$REUSE_API_FROM/image-identities.txt")
  EXPECTED_API_ID=${API_IDENTITY%% *}
  LOADED_API_ID=$(podman image inspect "$API_TAG" --format '{{.Id}}')
  if [[ "$LOADED_API_ID" != "$EXPECTED_API_ID" ]]; then
    printf 'Reused API image ID differs from the verified prior manifest.\n' >&2
    exit 1
  fi
fi
podman image inspect "$API_TAG" "$WEB_TAG" \
  --format '{{.Id}} {{.Digest}} {{.Os}}/{{.Architecture}} {{.Config.User}} {{json .Config.Healthcheck}} {{index .Config.Labels "org.opencontainers.image.revision"}}' \
  > "$OUT/image-identities.txt"
(
  cd "$OUT"
  sha256sum "$API_ARCHIVE" "$WEB_ARCHIVE" \
    compose.api.override.yaml compose.api.rollback.yaml compose.web.yaml \
    image-identities.txt > SHA256SUMS
)
printf 'Artifacts and checksums: %s\n' "$OUT"
