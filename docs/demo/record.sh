#!/bin/sh
# Re-record the README GIFs. Needs Docker. Run from the repo root: sh docs/demo/record.sh
set -e
docker build -q -t clauder-vhs - <<'EOF'
FROM ghcr.io/charmbracelet/vhs
RUN apt-get update && apt-get install -y --no-install-recommends nodejs && rm -rf /var/lib/apt/lists/*
EOF
for tape in docs/demo/*.tape; do
  docker run --rm -v "$PWD:/src" -w /src clauder-vhs "$tape"
done
